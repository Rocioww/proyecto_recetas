import { useEffect, useRef } from "react"

const selectorEnfocables = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Modal reutilizable: fondo oscuro semitransparente + tarjeta centrada.
// Clic en el fondo negro lo cierra; clic dentro de la tarjeta no cierra.
// Accesibilidad: se cierra con Escape, atrapa el foco (Tab no se escapa
// del modal mientras está abierto) y devuelve el foco a quien lo abrió
// al cerrarse.
function Modal({ children, onCerrar }){

    let tarjetaRef = useRef(null)

    // el efecto de abajo solo debe montar/desmontar sus listeners UNA vez
    // (si dependiera de onCerrar, cada nueva función inline que le pase el
    // padre en cada render reiniciaría el foco y las teclas); esta ref
    // guarda siempre la versión más reciente para que Escape nunca llame
    // a una versión antigua
    let onCerrarRef = useRef(onCerrar)
    useEffect(() => { onCerrarRef.current = onCerrar })

    useEffect(() => {
        let elementoPrevio = document.activeElement

        // mueve el foco dentro del modal al abrirse: al primer elemento
        // enfocable si lo hay, si no a la propia tarjeta
        let tarjeta = tarjetaRef.current
        let enfocables = tarjeta ? tarjeta.querySelectorAll(selectorEnfocables) : []
        if(enfocables.length > 0){
            enfocables[0].focus()
        }else if(tarjeta){
            tarjeta.focus()
        }

        function manejarTecla(evento){
            if(evento.key === "Escape"){
                onCerrarRef.current()
                return
            }
            if(evento.key !== "Tab") return

            // atrapa el foco: si Tab se sale por un extremo, salta al otro
            let tarjetaActual = tarjetaRef.current
            if(!tarjetaActual) return
            let focales = tarjetaActual.querySelectorAll(selectorEnfocables)
            if(focales.length === 0) return

            let primero = focales[0]
            let ultimo = focales[focales.length - 1]

            if(evento.shiftKey && document.activeElement === primero){
                evento.preventDefault()
                ultimo.focus()
            }else if(!evento.shiftKey && document.activeElement === ultimo){
                evento.preventDefault()
                primero.focus()
            }
        }

        document.addEventListener("keydown",manejarTecla)
        return () => {
            document.removeEventListener("keydown",manejarTecla)
            if(elementoPrevio && elementoPrevio.focus) elementoPrevio.focus()
        }
    },[])

    return  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
                {/* fondo: clic aquí cierra */}
                <div
                    className="absolute inset-0 bg-black/50 cursor-pointer"
                    onClick={onCerrar}
                />
                {/* tarjeta: clic aquí NO se propaga al fondo */}
                <div
                    ref={tarjetaRef}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                    className="relative bg-primary rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4 focus:outline-none my-auto"
                    onClick={ evento => evento.stopPropagation() }
                >
                    <button
                        onClick={onCerrar}
                        aria-label="Cerrar"
                        className="absolute top-4 right-4 text-grey hover:text-secondary"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                    {children}
                </div>
            </div>
}

export default Modal
