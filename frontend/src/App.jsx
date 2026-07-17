import { useState, useEffect } from "react"
import { RouterProvider, createBrowserRouter } from "react-router-dom"
import Contexto from "./Contexto"
import ToastProvider from "./ToastProvider"
import Cargando from "./Cargando"
import Layout from "./Layout"
import Login from "./pages/Login"
import Registro from "./pages/Registro"
import InvitacionMiembro from "./pages/InvitacionMiembro"
import InvitacionVer from "./pages/InvitacionVer"
import Inicio from "./pages/Inicio"
import Familias from "./pages/Familias"
import Arbol from "./pages/Arbol"
import Favoritos from "./pages/Favoritos"
import Coleccion from "./pages/Coleccion"
import PerfilMiembro from "./pages/PerfilMiembro"
import Receta from "./pages/Receta"
import CrearReceta from "./pages/CrearReceta"
import Perfil from "./pages/Perfil"
import NoEncontrada from "./pages/NoEncontrada"
import { obtenerYo, alExpirarSesion } from "./api"

const router = createBrowserRouter([
    {
        path : "/login",
        element : <Login />,
    },
    {
        path : "/registro",
        element : <Registro />,
    },
    {
        path : "/invitaciones/:token",
        element : <InvitacionMiembro />,
    },
    {
        path : "/invitaciones-ver/:token",
        element : <InvitacionVer />,
    },
    {
        element : <Layout />,
        children : [
            {
                path : "/",
                element : <Inicio />,
            },
            {
                path : "/familias",
                element : <Familias />,
            },
            {
                path : "/familias/:idFamilia",
                element : <Arbol />,
            },
            {
                path : "/miembros/:idMiembro",
                element : <PerfilMiembro />,
            },
            {
                path : "/recetas/nueva/:idMiembro",
                element : <CrearReceta />,
            },
            {
                path : "/recetas/:idReceta/editar",
                element : <CrearReceta modoEdicion={true} />,
            },
            {
                path : "/recetas/:idReceta",
                element : <Receta />,
            },
            {
                path : "/favoritos",
                element : <Favoritos />,
            },
            {
                path : "/colecciones/:idColeccion",
                element : <Coleccion />,
            },
            {
                path : "/perfil",
                element : <Perfil />,
            },
            {
                path : "*",
                element : <NoEncontrada />,
            },
        ],
    },
])

function App(){

    let [token,setTokenEstado] = useState(() => localStorage.getItem("token"))

    // si no hay token guardado no hay nada que comprobar contra el backend
    let [cargando,setCargando] = useState(() => !!localStorage.getItem("token"))

    // datos de la cuenta logueada, compartidos por toda la app (header,
    // perfil, modal de edición de miembro...) para que la foto de "Tú" se
    // vea igual en los tres sitios en cuanto se actualiza en cualquiera
    let [usuario,setUsuario] = useState(null)

    function refrescarUsuario(){
        if(!token) return Promise.resolve(null)
        return obtenerYo(token).then( u => { setUsuario(u); return u } ).catch(() => null)
    }

    // se comprueba/recarga la cuenta cada vez que cambia el token: al
    // cargar la app (si hay uno guardado, para confirmar que el backend lo
    // sigue aceptando antes de dar la app por lista) y también al iniciar
    // sesión desde Login, para que el header ya tenga la foto correcta sin
    // esperar a una recarga
    useEffect(() => {

        if(!token) return

        obtenerYo(token)
        .then( u => { setUsuario(u); setCargando(false) })
        .catch(() => {
            setToken(null)
            setCargando(false)
        })

    }, [token])

    // si cualquier petición devuelve 401 a media sesión (token caducado o
    // revocado), se cierra sesión sola: los guardas "if(!token) return
    // <Navigate to="/login"/>" que ya tiene cada página se encargan de
    // llevar de vuelta a login solos en cuanto el token pasa a null. El
    // aviso de "tu sesión ha caducado" se lee en Login desde sessionStorage,
    // igual que el flujo de invitación pendiente.
    useEffect(() => {
        alExpirarSesion(() => {
            sessionStorage.setItem("sesionCaducada","1")
            setToken(null)
        })
    }, [])

    function setToken(nuevoToken){
        if(nuevoToken){
            localStorage.setItem("token",nuevoToken)
        }else{
            localStorage.removeItem("token")
            setUsuario(null)
        }
        setTokenEstado(nuevoToken)
    }

    if(cargando){
        return <Cargando/>
    }

    return  <ToastProvider>
                <Contexto.Provider value={{token,setToken,usuario,refrescarUsuario}}>
                    <RouterProvider router={router}></RouterProvider>
                </Contexto.Provider>
            </ToastProvider>
}

export default App
