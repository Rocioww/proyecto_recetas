import { useState, useContext, useRef, useEffect } from "react"
import { Link, Navigate } from "react-router-dom"
import Contexto from "../Contexto"
import BotonGoogle from "../BotonGoogle"
import { iniciarSesion, mensajeErrorLogin } from "../api"
import logo from "../assets/legadoculinario_logo.png"

function Login(){

    let {token,setToken} = useContext(Contexto)

    // mensaje de error o null; distingue credenciales incorrectas de
    // "demasiados intentos" o de un fallo de red, en vez de un único
    // mensaje genérico para todo
    let [error,setError] = useState(null)

    // si App.jsx nos ha traído aquí porque el token caducó a media sesión,
    // se avisa una vez y se limpia la marca (mismo patrón que invitacionPendiente:
    // se lee en el inicializador perezoso y se borra aparte, en un efecto)
    let [sesionCaducada] = useState(() => !!sessionStorage.getItem("sesionCaducada"))

    useEffect(() => {
        sessionStorage.removeItem("sesionCaducada")
    },[])

    let [email,setEmail] = useState("")

    let [password,setPassword] = useState("")

    let formRef = useRef(null)

    // si venimos de un enlace de invitación, al iniciar sesión hay que volver
    // ahí en vez de a "/". Se calcula una sola vez (inicializador perezoso);
    // el borrado del valor guardado se hace aparte, en un efecto, para no
    // mezclar un efecto secundario con el cálculo del valor.
    let [destino] = useState(() => {
        try{
            let pendiente = sessionStorage.getItem("invitacionPendiente")
            if(!pendiente) return "/"
            let { tipo, token : tokenInvitacion } = JSON.parse(pendiente)
            return tipo === "ver" ? `/invitaciones-ver/${tokenInvitacion}` : `/invitaciones/${tokenInvitacion}`
        }catch{
            return "/"
        }
    })

    useEffect(() => {
        sessionStorage.removeItem("invitacionPendiente")
    },[])


    if(token) return <Navigate to={destino}/>

    return  <section className="min-h-dvh flex items-center justify-center p-4">
                <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center gap-4">
                    <img src={logo} alt="Legado Culinario" className="h-16 w-auto max-w-full object-contain" />

                    <div className="w-full h-px bg-grey/30"></div>

                    <form ref={formRef} className="w-full flex flex-col gap-4" onSubmit={ evento => {
                        evento.preventDefault()
                        setError(null)

                        iniciarSesion({email,password})
                        .then(({token}) => {
                            setToken(token)
                        })
                        .catch( codigo => {
                            setError(mensajeErrorLogin(codigo))
                        })
                    } }>
                        <div className="flex flex-col gap-1">
                            <h1 className="text-2xl">Entrar</h1>
                            {
                                sesionCaducada &&
                                <p className="text-accent text-sm">Tu sesión ha caducado, inicia sesión de nuevo.</p>
                            }
                        </div>
                        <label className="flex flex-col gap-1 text-xs text-black">
                            Email
                            <div className="relative">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-grey pointer-events-none"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="m3 8 9 6 9-6"/></svg>
                                <input id="email" type="email" value={email} onChange={ evento => setEmail(evento.target.value)} onKeyDown={ evento => { if(evento.key === "Enter"){ evento.preventDefault(); formRef.current.requestSubmit() } } } placeholder="Email" className="w-full border border-grey/40 rounded pl-9 pr-3 py-2.5 bg-form text-secondary focus:outline-none focus:border-accent" />
                            </div>
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-black">
                            Contraseña
                            <div className="relative">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-grey pointer-events-none"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3"/><path d="m16.5 6.5 3 3"/><path d="m13.5 9.5 2.5 2.5"/></svg>
                                <input id="password" type="password" value={password} onChange={ evento => setPassword(evento.target.value)} onKeyDown={ evento => { if(evento.key === "Enter"){ evento.preventDefault(); formRef.current.requestSubmit() } } } placeholder="Contraseña" className="w-full border border-grey/40 rounded pl-9 pr-3 py-2.5 bg-form text-secondary focus:outline-none focus:border-accent" />
                            </div>
                        </label>
                        {
                            error ? <p className="text-red-600 text-sm">{error}</p> : null
                        }
                        <input type="submit" value="Entrar" className="bg-accent text-primary uppercase tracking-wide rounded px-4 py-2 cursor-pointer hover:opacity-90" />

                        <div className="flex items-center gap-3 my-1">
                            <div className="flex-1 h-px bg-grey/30"></div>
                            <span className="text-xs text-grey">o</span>
                            <div className="flex-1 h-px bg-grey/30"></div>
                        </div>

                        <BotonGoogle />

                        <p className="text-sm text-black text-center">¿No tienes cuenta? <Link to="/registro" className="text-accent font-medium underline">Regístrate</Link></p>
                    </form>
                </div>
            </section>
}

export default Login
