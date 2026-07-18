import { useContext, useState, useEffect } from "react"
import { Navigate, Link, NavLink, Outlet } from "react-router-dom"
import Contexto from "./Contexto"
import PanelNotificaciones from "./PanelNotificaciones"
import { obtenerNotificaciones, urlFoto } from "./api"
import logo from "./assets/legadoculinario_logo.png"

const claveVistas = "notificacionesVistas"

// fecha más reciente entre las recetas recién añadidas y las sugerencias pendientes
function fechaMasReciente(datos){
    let fechas = [...datos.recientes,...datos.sugerencias].map( item => new Date(item.creado).getTime() )
    return fechas.length > 0 ? Math.max(...fechas) : 0
}

function iniciales(nombre){
    if(!nombre) return "?"
    let partes = nombre.trim().split(" ")
    return (partes[0][0] + (partes[1] ? partes[1][0] : "")).toUpperCase()
}

// iconos inline para el menú inferior de móvil
function IconoInicio(){
    return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
}

function IconoFamilias(){
    return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.5"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/><path d="M12 7.5v4m0 0-5 4m5-4 5 4"/></svg>
}

function IconoFavoritos(){
    return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.5s-7.5-4.7-9.3-9.4C1.4 7.6 3.6 4.5 6.8 4.5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.2 0 5.4 3.1 4.1 6.6-1.8 4.7-9.3 9.4-9.3 9.4Z"/></svg>
}

function IconoPerfil(){
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.2-3.5 4-5 7.5-5s6.3 1.5 7.5 5"/></svg>
}

function IconoNotificaciones(){
    return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
}

let enlaces = [
    { ruta : "/", texto : "Inicio", Icono : IconoInicio },
    { ruta : "/familias", texto : "Familias", Icono : IconoFamilias },
    { ruta : "/favoritos", texto : "Favoritos", Icono : IconoFavoritos },
]

// enlace individual del navbar central de escritorio
function EnlaceNav({ enlace }){
    return  <NavLink
                to={enlace.ruta}
                end={enlace.ruta === "/"}
                className={ ({isActive}) => `relative flex items-center justify-center w-24 text-[0.955rem] transition-colors pointer-events-auto ${isActive ? "text-accent font-semibold" : "text-secondary hover:text-accent"}` }
            >
                {
                    ({isActive}) => <>
                        <span className="translate-y-[3px]">{enlace.texto}</span>
                        <span className={`absolute left-0 right-0 bottom-0 h-0.5 ${isActive ? "bg-accent" : "bg-transparent"}`} />
                    </>
                }
            </NavLink>
}

function Layout(){

    let { token, usuario } = useContext(Contexto)

    let [notificacionesAbiertas,setNotificacionesAbiertas] = useState(false)
    let [hayNuevas,setHayNuevas] = useState(false)

    // consulta si hay notificaciones más recientes que la última visita al panel
    useEffect(() => {
        if(!token) return

        function comprobar(){
            obtenerNotificaciones(token).then( datos => {
                let vistas = Number(localStorage.getItem(claveVistas)) || 0
                setHayNuevas(fechaMasReciente(datos) > vistas)
            }).catch(() => {})
        }

        comprobar()
        let intervalo = setInterval(comprobar,60000)
        return () => clearInterval(intervalo)
    },[token])

    function abrirNotificaciones(){
        setNotificacionesAbiertas(true)
        setHayNuevas(false)
        localStorage.setItem(claveVistas,Date.now().toString())
    }

    if(!token){
        return <Navigate to="/login"/>
    }

    return  <div className="h-dvh flex flex-col">

                <header className="h-[70px] shrink-0 relative flex items-center justify-between px-4 border-b border-grey/20 bg-primary">

                    <Link to="/" className="shrink-0">
                        <img src={logo} alt="Legado Culinario" className="h-[51px] w-auto" />
                    </Link>

                    {/* navbar central: solo a partir de 992px. Grid de 3 columnas simétricas
                        (1fr auto 1fr) para que "Familias" quede exactamente en el centro del
                        viewport, sin importar el ancho de los enlaces a los lados */}
                    <nav className="hidden lg:grid grid-cols-[1fr_auto_1fr] items-stretch absolute left-0 right-0 top-0 h-full px-4 pointer-events-none">
                        <div className="flex items-stretch justify-end pr-5">
                            <EnlaceNav enlace={enlaces[0]} />
                        </div>
                        <div className="flex items-stretch">
                            <EnlaceNav enlace={enlaces[1]} />
                        </div>
                        <div className="flex items-stretch justify-start pl-5">
                            <EnlaceNav enlace={enlaces[2]} />
                        </div>
                    </nav>

                    <div className="flex items-center gap-4">
                        <button onClick={abrirNotificaciones} className="relative text-secondary hover:text-accent transition-colors" aria-label="Notificaciones">
                            <IconoNotificaciones />
                            {
                                hayNuevas &&
                                <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-primary" />
                            }
                        </button>
                        <Link to="/perfil" className="shrink-0 text-secondary hover:text-accent transition-colors" aria-label="Perfil">
                            {
                                usuario?.foto
                                ? <img src={urlFoto(usuario.foto)} alt={usuario.nombre} className="w-8 h-8 rounded-full object-cover" />
                                : usuario
                                    ? <div className="w-8 h-8 rounded-full bg-accent text-primary text-xs font-semibold flex items-center justify-center leading-none">{iniciales(usuario.nombre)}</div>
                                    : <IconoPerfil />
                            }
                        </Link>
                    </div>

                </header>

                <main className="flex-1 overflow-y-auto">
                    <Outlet />
                </main>

                <PanelNotificaciones
                    abierto={notificacionesAbiertas}
                    onCerrar={ () => setNotificacionesAbiertas(false) }
                    token={token}
                />

                {/* menú inferior tipo app: solo por debajo de 992px */}
                <nav className="lg:hidden h-16 shrink-0 flex items-center justify-around border-t border-grey/20 bg-primary">
                    {
                        enlaces.map( enlace =>
                            <NavLink
                                key={enlace.ruta}
                                to={enlace.ruta}
                                end={enlace.ruta === "/"}
                                className={ ({isActive}) => `flex flex-col items-center gap-0.5 text-[11px] transition-colors ${isActive ? "text-accent font-semibold" : "text-grey hover:text-accent"}` }
                            >
                                <enlace.Icono />
                                {enlace.texto}
                            </NavLink>
                        )
                    }
                </nav>

            </div>
}

export default Layout
