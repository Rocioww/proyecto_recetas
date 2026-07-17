import { useRef, useState } from "react"
import ToastContexto from "./ToastContexto"

// toast flotante global con "Deshacer" opcional. Vive por encima de las
// rutas (ver App.jsx) para que sobreviva a la navegación: al borrar algo se
// puede navegar a otra pantalla y el aviso sigue visible unos segundos.
// Los toasts se ENCOLAN: si se llama a mostrarToast mientras uno ya está
// visible, el nuevo espera su turno en vez de cancelar al anterior.
function ToastProvider({children}){
    let [toast,setToast] = useState(null)
    let cola = useRef([])
    let idToast = useRef(0)
    // id del toast que manda ahora mismo (o null si no hay ninguno). Es una
    // ref, no estado: los timeouts de abajo la consultan de forma síncrona
    // para saber si siguen "al mando" antes de actuar. Sin esto, si se
    // deshace un toast ANTES de que le tocara desaparecer solo, sus propios
    // timeouts (ya obsoletos) seguirían disparándose más tarde y podrían
    // cortar de golpe al siguiente toast que ya haya ocupado su lugar.
    let idActual = useRef(null)

    function mostrarSiguiente(){
        let siguiente = cola.current.shift()
        if(!siguiente){
            idActual.current = null
            setToast(null)
            return
        }
        idActual.current = siguiente.id
        setToast({ ...siguiente, saliendo : false })
        setTimeout(() => {
            if(idActual.current !== siguiente.id) return
            setToast( t => (t && t.id === siguiente.id) ? { ...t, saliendo : true } : t )
        }, 3500)
        setTimeout(() => {
            if(idActual.current !== siguiente.id) return
            mostrarSiguiente()
        }, 4000)
    }

    function mostrarToast(texto, onDeshacer){
        let miId = ++idToast.current
        cola.current.push({ id : miId, texto, onDeshacer })
        if(idActual.current === null) mostrarSiguiente()
    }

    function manejarDeshacer(){
        if(!toast) return
        let onDeshacer = toast.onDeshacer
        mostrarSiguiente()
        if(onDeshacer) onDeshacer()
    }

    return  <ToastContexto.Provider value={{mostrarToast}}>
                {children}
                {
                    toast &&
                    <div className={`fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-secondary text-primary rounded-2xl shadow-lg flex items-center gap-3 pl-4 pr-4 py-3 max-w-[92vw] ${toast.saliendo ? "animate-[fadeOut_0.5s_ease-in_forwards]" : "animate-[fadeIn_0.25s_ease-out]"}`}>
                        <span className="text-sm">{toast.texto}</span>
                        {
                            toast.onDeshacer &&
                            <button onClick={manejarDeshacer} className="text-sm font-semibold text-accent2 hover:underline shrink-0 ml-1">Deshacer</button>
                        }
                    </div>
                }
            </ToastContexto.Provider>
}

export default ToastProvider
