import { useState, useRef, useEffect } from "react"

// Visor de imagen a pantalla completa con zoom.
// - Desktop: rueda del ratón para acercar/alejar, arrastrar para mover.
// - Móvil: pellizco con dos dedos para el zoom, arrastrar con uno para mover.
// - Doble clic/toque: alterna entre 1x y 2.5x.
function VisorFoto({ src, alt = "", onCerrar }){

    let [escala,setEscala] = useState(1)
    let [pos,setPos] = useState({ x:0, y:0 })
    // solo se usa para la transición CSS (ver estilo más abajo); la lógica
    // de arrastre en sí usa la ref "arrastrando" para no re-renderizar en
    // cada mousemove/touchmove
    let [estaArrastrando,setEstaArrastrando] = useState(false)

    let contenedorRef = useRef(null)
    let arrastrando = useRef(false)
    let inicio = useRef({ x:0, y:0 })
    // para el pellizco: distancia inicial entre los dos dedos
    let distanciaPrevia = useRef(null)

    function limitar(valor, min, max){
        return Math.max(min, Math.min(max, valor))
    }

    function alAcercar(delta){
        setEscala( actual => limitar(actual + delta, 1, 5) )
    }

    function manejarRueda(evento){
        evento.preventDefault()
        alAcercar(evento.deltaY < 0 ? 0.3 : -0.3)
    }

    function manejarDobleClic(){
        if(escala > 1){
            setEscala(1)
            setPos({ x:0, y:0 })
        }else{
            setEscala(2.5)
        }
    }

    // ---- ratón: arrastrar cuando hay zoom ----
    function manejarRatonAbajo(evento){
        if(escala <= 1) return
        arrastrando.current = true
        setEstaArrastrando(true)
        inicio.current = { x : evento.clientX - pos.x, y : evento.clientY - pos.y }
    }

    useEffect(() => {
        function mover(evento){
            if(!arrastrando.current) return
            setPos({ x : evento.clientX - inicio.current.x, y : evento.clientY - inicio.current.y })
        }
        function soltar(){ arrastrando.current = false; setEstaArrastrando(false) }
        window.addEventListener("mousemove", mover)
        window.addEventListener("mouseup", soltar)
        return () => {
            window.removeEventListener("mousemove", mover)
            window.removeEventListener("mouseup", soltar)
        }
    },[])

    // ---- táctil: pellizco para zoom, un dedo para mover ----
    function distanciaEntre(t1, t2){
        let dx = t1.clientX - t2.clientX
        let dy = t1.clientY - t2.clientY
        return Math.sqrt(dx*dx + dy*dy)
    }

    function manejarTouchInicio(evento){
        if(evento.touches.length === 2){
            distanciaPrevia.current = distanciaEntre(evento.touches[0], evento.touches[1])
        }else if(evento.touches.length === 1 && escala > 1){
            arrastrando.current = true
            setEstaArrastrando(true)
            inicio.current = { x : evento.touches[0].clientX - pos.x, y : evento.touches[0].clientY - pos.y }
        }
    }

    function manejarTouchMover(evento){
        if(evento.touches.length === 2 && distanciaPrevia.current != null){
            evento.preventDefault()
            let distancia = distanciaEntre(evento.touches[0], evento.touches[1])
            let factor = distancia / distanciaPrevia.current
            distanciaPrevia.current = distancia
            setEscala( actual => limitar(actual * factor, 1, 5) )
        }else if(evento.touches.length === 1 && arrastrando.current){
            evento.preventDefault()
            setPos({ x : evento.touches[0].clientX - inicio.current.x, y : evento.touches[0].clientY - inicio.current.y })
        }
    }

    function manejarTouchFin(evento){
        if(evento.touches.length < 2) distanciaPrevia.current = null
        if(evento.touches.length === 0){ arrastrando.current = false; setEstaArrastrando(false) }
    }

    return  <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center touch-none select-none">
                <button
                    onClick={onCerrar}
                    aria-label="Cerrar"
                    className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>

                {/* clic en el fondo cierra */}
                <div className="absolute inset-0 cursor-pointer" onClick={onCerrar} />

                <img
                    ref={contenedorRef}
                    src={src}
                    alt={alt}
                    onWheel={manejarRueda}
                    onMouseDown={manejarRatonAbajo}
                    onDoubleClick={manejarDobleClic}
                    onTouchStart={manejarTouchInicio}
                    onTouchMove={manejarTouchMover}
                    onTouchEnd={manejarTouchFin}
                    draggable={false}
                    className="relative max-w-[92vw] max-h-[88vh] object-contain rounded-lg"
                    style={{
                        transform : `translate(${pos.x}px, ${pos.y}px) scale(${escala})`,
                        cursor : escala > 1 ? "grab" : "zoom-in",
                        transition : estaArrastrando ? "none" : "transform 0.15s ease-out",
                    }}
                />

                <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs">
                    Doble toque para ampliar · pellizca o usa la rueda
                </p>
            </div>
}

export default VisorFoto
