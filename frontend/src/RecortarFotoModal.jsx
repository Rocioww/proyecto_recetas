import { useState, useRef, useEffect } from "react"
import Modal from "./Modal"
import Cargando from "./Cargando"

// proporción por defecto: la del hueco de foto de la tarjeta del árbol
// (ancho de tarjeta x mitad de su alto), para que lo que se recorta aquí
// coincida con lo que luego se ve allí. Puede sobreescribirse con la prop
// "proporcion" (p.ej. 1 para una foto de perfil circular).
const relacionPorDefecto = 160 / 90
const visorAltoDiseno  = 180

// modal que deja mover y hacer zoom sobre una foto recién elegida antes de
// subirla, para escoger qué parte de la imagen se ve. Devuelve un File ya
// recortado mediante onRecortada, listo para subirse igual que cualquier
// otro archivo de foto. "proporcion" es ancho/alto del recorte (1 = cuadrado).
function RecortarFotoModal({ archivo, proporcion = relacionPorDefecto, onCancelar, onRecortada }){

    let relacion = proporcion
    let visorAnchoDiseno = Math.round(visorAltoDiseno * relacion)
    let salidaAlto  = visorAltoDiseno * 2
    let salidaAncho = visorAnchoDiseno * 2

    let [urlImagen,setUrlImagen] = useState(null)
    let [dimensiones,setDimensiones] = useState(null) // {width,height} naturales
    let [zoom,setZoom] = useState(1) // 1 = la imagen cubre justo el visor, "object-cover"
    let [offset,setOffset] = useState({ x : 0, y : 0 })
    let [guardando,setGuardando] = useState(false)

    // imagen cargada de forma independiente del <img> del DOM (que solo se
    // usa para que el usuario la vea): así el recorte final no depende de
    // cuándo termine de pintarse ese <img>
    let imagenRef = useRef(null)
    let arrastrando = useRef(false)
    let inicioArrastre = useRef({ x : 0, y : 0, offsetX : 0, offsetY : 0 })

    // tamaño real en pantalla del visor (puede ser menor que el de diseño
    // en móviles estrechos, ya que el visor ahora es w-full/max-w); se mide
    // con ResizeObserver para que el recorte use siempre el tamaño real
    let visorRef = useRef(null)
    let [tamVisor,setTamVisor] = useState({ ancho : visorAnchoDiseno, alto : visorAltoDiseno })

    useEffect(() => {
        let elemento = visorRef.current
        if(!elemento) return
        let observador = new ResizeObserver( entradas => {
            let { width, height } = entradas[0].contentRect
            if(width > 0 && height > 0) setTamVisor({ ancho : width, alto : height })
        })
        observador.observe(elemento)
        return () => observador.disconnect()
    },[])

    // creación Y revocación del blob emparejadas dentro del MISMO efecto:
    // en desarrollo, React monta este efecto, lo desmonta y lo vuelve a
    // montar una vez (para detectar fugas). Si la URL se creara fuera del
    // efecto, ese desmontaje de prueba la revocaría de verdad y el remontaje
    // no crearía una nueva, dejando una URL muerta. Al crearla aquí dentro,
    // el remontaje genera una URL fresca y válida.
    useEffect(() => {
        let url = URL.createObjectURL(archivo)
        let cancelado = false
        queueMicrotask(() => { if(!cancelado) setUrlImagen(url) })
        return () => {
            cancelado = true
            URL.revokeObjectURL(url)
        }
    },[archivo])

    useEffect(() => {
        let cancelado = false
        let img = new window.Image()
        img.src = urlImagen

        function manejarCarga(){
            if(cancelado) return
            imagenRef.current = img
            setDimensiones({ width : img.naturalWidth, height : img.naturalHeight })
        }

        if(img.complete && img.naturalWidth > 0){
            manejarCarga()
        } else {
            img.onload = manejarCarga
        }

        return () => { cancelado = true }
    },[urlImagen])

    // escala mínima para que la imagen cubra el visor entero, sin huecos
    function escalaBase(dim){
        if(!dim) return 1
        return Math.max(tamVisor.ancho / dim.width, tamVisor.alto / dim.height)
    }

    function escalaFinal(){
        return escalaBase(dimensiones) * zoom
    }

    // no deja arrastrar más allá de donde la imagen dejaría de cubrir el visor
    function limitarOffset(x, y, escala, dim){
        if(!dim) return { x : 0, y : 0 }
        let maxX = Math.max(0, (dim.width * escala - tamVisor.ancho) / 2)
        let maxY = Math.max(0, (dim.height * escala - tamVisor.alto) / 2)
        return {
            x : Math.min(maxX, Math.max(-maxX, x)),
            y : Math.min(maxY, Math.max(-maxY, y)),
        }
    }

    function alPresionar(evento){
        if(!dimensiones) return
        arrastrando.current = true
        inicioArrastre.current = { x : evento.clientX, y : evento.clientY, offsetX : offset.x, offsetY : offset.y }
        evento.currentTarget.setPointerCapture(evento.pointerId)
    }

    function alMover(evento){
        if(!arrastrando.current) return
        let dx = evento.clientX - inicioArrastre.current.x
        let dy = evento.clientY - inicioArrastre.current.y
        setOffset(limitarOffset(inicioArrastre.current.offsetX + dx, inicioArrastre.current.offsetY + dy, escalaFinal(), dimensiones))
    }

    function alSoltar(){
        arrastrando.current = false
    }

    function manejarZoom(evento){
        let nuevoZoom = Number(evento.target.value)
        setZoom(nuevoZoom)
        setOffset( o => limitarOffset(o.x, o.y, escalaBase(dimensiones) * nuevoZoom, dimensiones) )
    }

    function confirmar(){
        if(!dimensiones || !imagenRef.current || guardando) return
        setGuardando(true)

        let escala = escalaFinal()
        let factorSalida = salidaAncho / tamVisor.ancho

        // punto de la imagen original que cae justo en el centro del visor
        let cx = dimensiones.width / 2 - offset.x / escala
        let cy = dimensiones.height / 2 - offset.y / escala

        let canvas = document.createElement("canvas")
        canvas.width = salidaAncho
        canvas.height = salidaAlto
        let ctx = canvas.getContext("2d")
        ctx.save()
        ctx.translate(salidaAncho / 2, salidaAlto / 2)
        ctx.scale(escala * factorSalida, escala * factorSalida)
        ctx.drawImage(imagenRef.current, -cx, -cy)
        ctx.restore()

        canvas.toBlob( blob => {
            if(!blob){ setGuardando(false); return }
            onRecortada(new File([blob], archivo.name || "foto.jpg", { type : "image/jpeg" }))
        }, "image/jpeg", 0.9)
    }

    return  <Modal onCerrar={onCancelar}>
                <h2 className="font-display text-[1.425rem] font-semibold">Ajustar foto</h2>
                <p className="text-xs text-grey">Arrastra la imagen para moverla y usa el control para acercar o alejar.</p>

                <div
                    ref={visorRef}
                    className="relative mx-auto w-full rounded-2xl overflow-hidden bg-grey/10 cursor-grab active:cursor-grabbing touch-none select-none"
                    style={{ maxWidth : visorAnchoDiseno, aspectRatio : relacion }}
                    onPointerDown={alPresionar}
                    onPointerMove={alMover}
                    onPointerUp={alSoltar}
                    onPointerCancel={alSoltar}
                >
                    {
                        !dimensiones &&
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Cargando chico/>
                        </div>
                    }
                    {
                        dimensiones &&
                        <img
                            src={urlImagen}
                            alt=""
                            draggable={false}
                            style={{
                                position : "absolute",
                                left : "50%",
                                top : "50%",
                                width : dimensiones.width * escalaFinal(),
                                height : dimensiones.height * escalaFinal(),
                                transform : `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                                maxWidth : "none",
                            }}
                        />
                    }
                </div>

                <label className="flex flex-col gap-1 text-xs text-black">
                    Zoom
                    <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.01"
                        value={zoom}
                        onChange={manejarZoom}
                        disabled={!dimensiones}
                        className="w-full accent-accent"
                    />
                </label>

                <div className="flex gap-2 justify-end pt-2">
                    <button type="button" onClick={onCancelar} className="text-sm text-grey hover:text-secondary px-4 py-2">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={confirmar}
                        disabled={!dimensiones || guardando}
                        className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60"
                    >
                        {guardando ? "procesando…" : "usar esta foto"}
                    </button>
                </div>
            </Modal>
}

export default RecortarFotoModal
