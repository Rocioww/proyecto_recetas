import { useEffect, useRef, useContext, useState } from "react"
import Contexto from "./Contexto"
import { loginConGoogle } from "./api"

// Botón "Continuar con Google" usando Google Identity Services (script cargado
// en index.html). Sirve tanto para iniciar sesión como para registrarse: el
// backend crea la cuenta automáticamente la primera vez que entra ese email.
function BotonGoogle(){

    let { setToken } = useContext(Contexto)
    let contenedorRef = useRef(null)
    let clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

    // sin esto no tiene sentido ni intentarlo: aviso claro en vez de fallar en
    // silencio. Se calcula en el estado inicial (no con un setState síncrono
    // dentro del efecto) porque clientId ya se conoce en el primer render.
    let [error,setError] = useState(() => !clientId ? "Falta VITE_GOOGLE_CLIENT_ID en el .env del frontend (y reiniciar el servidor tras añadirlo)" : null)

    useEffect(() => {

        if(!clientId) return

        function manejarCredencial(respuesta){
            setError(null)
            loginConGoogle(respuesta.credential)
            .then( ({token}) => setToken(token) )
            .catch( () => setError("No se ha podido iniciar sesión con Google. Inténtalo de nuevo.") )
        }

        let intentos = 0
        let inicializado = false
        let observador = null

        // el botón de Google solo acepta un ancho en píxeles (no "100%"), así que
        // hay que medir el contenedor y volver a pintarlo si su ancho cambia
        // (primer layout, o si la ventana cambia de tamaño)
        function pintarBoton(){
            if(!contenedorRef.current) return
            let ancho = contenedorRef.current.offsetWidth
            if(!ancho) return

            contenedorRef.current.innerHTML = ""
            window.google.accounts.id.renderButton(contenedorRef.current, {
                type : "standard",
                theme : "outline",
                size : "large",
                width : String(ancho),
                text : "continue_with",
                shape : "rectangular",
            })
        }

        function intentarInicializar(){
            intentos++

            if(!window.google || !window.google.accounts || !contenedorRef.current){
                return false
            }

            try{
                if(!inicializado){
                    window.google.accounts.id.initialize({
                        client_id : clientId,
                        callback : manejarCredencial,
                    })
                    inicializado = true
                }

                pintarBoton()

                observador = new ResizeObserver(() => pintarBoton())
                observador.observe(contenedorRef.current)

                return true
            }catch(e){
                console.error("Error inicializando el botón de Google:", e)
                setError("Google ha rechazado la configuración. Revisa la consola del navegador (F12) para ver el motivo exacto.")
                return true // paramos de reintentar, el error ya está mostrado
            }
        }

        // el script de Google carga async; reintentamos hasta que esté listo
        if(!intentarInicializar()){
            let intervalo = setInterval(() => {
                if(intentarInicializar()){
                    clearInterval(intervalo)
                }else if(intentos > 25){ // ~5 segundos
                    clearInterval(intervalo)
                    setError("El script de Google no ha llegado a cargar. Revisa tu conexión o si algo lo está bloqueando (adblock, etc).")
                }
            }, 200)
            return () => {
                clearInterval(intervalo)
                if(observador) observador.disconnect()
            }
        }

        return () => {
            if(observador) observador.disconnect()
        }
    },[clientId])

    return  <div className="flex flex-col gap-2 w-full items-center">
                <div ref={contenedorRef} className="w-full flex justify-center"></div>
                {
                    error &&
                    <p className="text-red-600 text-xs text-center">{error}</p>
                }
            </div>
}

export default BotonGoogle
