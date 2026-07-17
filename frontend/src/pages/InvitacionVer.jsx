import { useState, useContext, useEffect } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import Contexto from "../Contexto"
import Cargando from "../Cargando"
import { verInvitacionVer, aceptarInvitacionVer } from "../api"

// página pública: alguien pincha un enlace de "compartir árbol" (solo ver)
function InvitacionVer(){

    let { token : tokenInvitacion } = useParams()
    let { token } = useContext(Contexto)
    let navigate = useNavigate()

    let [datos,setDatos] = useState(null)
    let [error,setError] = useState(null)
    let [aceptando,setAceptando] = useState(false)

    useEffect(() => {
        verInvitacionVer(tokenInvitacion)
        .then(setDatos)
        .catch( codigo => {
            if(codigo === 409) setError("Este enlace ya se ha usado.")
            else if(codigo === 404) setError("Este enlace no es válido.")
            else setError("No se ha podido cargar la invitación.")
        })
    },[tokenInvitacion])

    function manejarAceptar(){
        if(aceptando) return
        setAceptando(true)
        aceptarInvitacionVer(tokenInvitacion,token)
        // directo al árbol, sin pantalla intermedia
        .then( ({idFamilia}) => navigate(`/familias/${idFamilia}`,{ replace : true }) )
        .catch(() => {
            setError("No se ha podido aceptar la invitación. Puede que ya se haya usado.")
            setAceptando(false)
        })
    }

    // si ya hay sesión (recién iniciada o ya existente), aceptar solo, sin pantalla intermedia
    useEffect(() => {
        if(token && datos && !error) manejarAceptar()
    },[token, datos])

    function irALogin(){
        sessionStorage.setItem("invitacionPendiente", JSON.stringify({ tipo : "ver", token : tokenInvitacion }))
        navigate("/login")
    }

    function irARegistro(){
        sessionStorage.setItem("invitacionPendiente", JSON.stringify({ tipo : "ver", token : tokenInvitacion }))
        navigate("/registro")
    }

    if(error){
        return  <div className="min-h-screen flex items-center justify-center p-6">
                    <div className="max-w-sm text-center flex flex-col gap-3">
                        <p className="text-secondary">{error}</p>
                        <Link to="/" className="text-accent hover:underline text-sm">Ir al inicio</Link>
                    </div>
                </div>
    }

    if(!datos || token){
        // con sesión ya se está aceptando sola (ver efecto de arriba)
        return <Cargando/>
    }

    return  <div className="min-h-screen flex items-center justify-center p-6">
                <div className="max-w-sm text-center flex flex-col gap-4 bg-white rounded-2xl shadow p-6">
                    <h1 className="text-xl font-display">Te han invitado</h1>
                    <p className="text-secondary text-sm">
                        <strong>{datos.invitadoPor}</strong> te ha invitado a ver el árbol de recetas de la familia {datos.nombreFamilia}.
                    </p>
                    <div className="flex flex-col gap-2">
                        <button onClick={irALogin} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 hover:opacity-90">Iniciar sesión</button>
                        <button onClick={irARegistro} className="text-sm text-accent hover:underline">Crear una cuenta</button>
                    </div>
                </div>
            </div>
}

export default InvitacionVer
