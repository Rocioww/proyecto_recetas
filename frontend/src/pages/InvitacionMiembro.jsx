import { useState, useContext, useEffect } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import Contexto from "../Contexto"
import Cargando from "../Cargando"
import { verInvitacionMiembro, aceptarInvitacionMiembro } from "../api"

// página pública: alguien pincha un enlace de "vincular familiar" y aquí
// ve quién le invita y a qué miembro, con o sin sesión iniciada
function InvitacionMiembro(){

    let { token : tokenInvitacion } = useParams()
    let { token } = useContext(Contexto)
    let navigate = useNavigate()

    let [datos,setDatos] = useState(null)
    let [error,setError] = useState(null)
    let [aceptando,setAceptando] = useState(false)

    useEffect(() => {
        verInvitacionMiembro(tokenInvitacion)
        .then(setDatos)
        .catch( codigo => {
            if(codigo === 409) setError("Esta invitación ya se ha usado.")
            else if(codigo === 404) setError("Este enlace no es válido.")
            else setError("No se ha podido cargar la invitación.")
        })
    },[tokenInvitacion])

    function irALogin(){
        sessionStorage.setItem("invitacionPendiente", JSON.stringify({ tipo : "miembro", token : tokenInvitacion }))
        navigate("/login")
    }

    function irARegistro(){
        sessionStorage.setItem("invitacionPendiente", JSON.stringify({ tipo : "miembro", token : tokenInvitacion }))
        navigate("/registro")
    }

    function manejarAceptar(){
        if(aceptando) return
        setAceptando(true)
        aceptarInvitacionMiembro(tokenInvitacion,token)
        // directo al árbol: ahí se ve ya la propia card marcada y centrada como "Tú"
        .then( ({idFamilia}) => navigate(`/familias/${idFamilia}`,{ replace : true }) )
        .catch(() => {
            setError("No se ha podido aceptar la invitación. Puede que ya se haya usado.")
            setAceptando(false)
        })
    }

    if(error){
        return  <div className="min-h-screen flex items-center justify-center p-6">
                    <div className="max-w-sm text-center flex flex-col gap-3">
                        <p className="text-secondary">{error}</p>
                        <Link to="/" className="text-accent hover:underline text-sm">Ir al inicio</Link>
                    </div>
                </div>
    }

    if(!datos){
        return <Cargando/>
    }

    return  <div className="min-h-screen flex items-center justify-center p-6">
                <div className="max-w-sm text-center flex flex-col gap-4 bg-white rounded-2xl shadow p-6">
                    <h1 className="text-xl font-display">Te han invitado</h1>
                    <p className="text-secondary text-sm">
                        <strong>{datos.invitadoPor}</strong> te ha invitado a unirte como <strong>{datos.nombreMiembro}</strong> ({datos.parentesco}) en el árbol de la familia {datos.nombreFamilia}.
                    </p>
                    {
                        token
                        ? <button onClick={manejarAceptar} disabled={aceptando} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 hover:opacity-90 disabled:opacity-60">
                            {aceptando ? "..." : "Aceptar"}
                          </button>
                        : <div className="flex flex-col gap-2">
                            <button onClick={irALogin} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 hover:opacity-90">Iniciar sesión</button>
                            <button onClick={irARegistro} className="text-sm text-accent hover:underline">Crear una cuenta</button>
                          </div>
                    }
                </div>
            </div>
}

export default InvitacionMiembro
