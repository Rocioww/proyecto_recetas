import { useState, useContext, useEffect } from "react"
import { useParams, useNavigate, Navigate } from "react-router-dom"
import ModalConfirmar from "../ModalConfirmar"
import AvisoSugerencia from "../AvisoSugerencia"
import Cargando from "../Cargando"
import Contexto from "../Contexto"
import ToastContexto from "../ToastContexto"
import { obtenerMiembro, obtenerReceta, crearReceta, editarReceta, borrarReceta, subirFotosReceta, subirFotoPasoReceta, crearSugerencia, urlFoto } from "../api"

// espera antes de ejecutar de verdad el borrado, para dar tiempo a deshacer
const retrasoBorradoMs = 4000

// compone la frase visible: "2 litros de aceite", "2 huevos", "sal al gusto"
function textoIngrediente(cantidad, unidad, nombre){
    if(cantidad === "" || cantidad === null){
        return nombre
    }
    if(unidad.trim() === ""){
        return `${cantidad} ${nombre}`
    }
    return `${cantidad} ${unidad} de ${nombre}`
}

let categorias = ["entrante","primero","segundo","postre"]
let temporadas = ["primavera","verano","otoño","invierno","todo el año"]

function CrearReceta({ modoEdicion = false }){

    let { idMiembro, idReceta } = useParams()
    let { token } = useContext(Contexto)
    let navigate = useNavigate()
    let { mostrarToast } = useContext(ToastContexto)

    let [miembro,setMiembro] = useState(null)

    let [nombre,setNombre] = useState("")
    let [dedicatoria,setDedicatoria] = useState("")

    // imágenes seleccionadas (objetos File) y cuál será la portada
    let [archivos,setArchivos] = useState([])
    let [portadaIndice,setPortadaIndice] = useState(0)
    let [tiempo,setTiempo] = useState("")
    let [categoria,setCategoria] = useState("primero")
    let [temporada,setTemporada] = useState("todo el año")

    // las cantidades se escriben SIEMPRE para 1 ración
    let [ingredientes,setIngredientes] = useState([{ cantidad : "", unidad : "", nombre : "" }])
    // cada paso: texto + foto opcional. "foto" es la ya guardada en el
    // servidor (solo en edición) y "archivoNuevo" un File pendiente de subir
    let [pasos,setPasos] = useState([{ texto : "", foto : null, archivoNuevo : null }])

    let [error,setError] = useState(false)
    let [enviando,setEnviando] = useState(false)

    // solo relevantes en modo edición: si no se puede editar directo, se
    // manda una sugerencia en vez de guardar de verdad
    let [puedeEditar,setPuedeEditar] = useState(true)
    let [creador,setCreador] = useState(null)
    let [original,setOriginal] = useState(null)

    useEffect(() => {
        if(!token) return
        if(modoEdicion){
            obtenerReceta(idReceta,token).then( r => {
                setMiembro({ familia : r.familia, _id : r.autor })
                setNombre(r.nombre || "")
                setDedicatoria(r.dedicatoria || "")
                setTiempo(r.tiempoMinutos != null ? String(r.tiempoMinutos) : "")
                setCategoria(r.categoria || "primero")
                setTemporada(r.temporada || "todo el año")
                setIngredientes((r.ingredientes && r.ingredientes.length > 0)
                    ? r.ingredientes.map( ing => ({ cantidad : ing.cantidad != null ? String(ing.cantidad) : "", unidad : ing.unidad || "", nombre : ing.nombre || "" }))
                    : [{ cantidad : "", unidad : "", nombre : "" }])
                setPasos((r.pasos && r.pasos.length > 0)
                    ? r.pasos.map( p => typeof p === "string"
                        ? { texto : p, foto : null, archivoNuevo : null }
                        : { texto : p.texto || "", foto : p.foto || null, archivoNuevo : null } )
                    : [{ texto : "", foto : null, archivoNuevo : null }])
                setPuedeEditar(!!r.puedeEditar)
                setCreador(r.creador || null)
                setOriginal({
                    nombre : r.nombre || "",
                    tiempoMinutos : r.tiempoMinutos != null ? r.tiempoMinutos : null,
                    categoria : r.categoria || "primero",
                    temporada : r.temporada || "todo el año",
                    ingredientes : r.ingredientes || [],
                    pasos : r.pasos || [],
                })
            })
        }else{
            obtenerMiembro(idMiembro,token).then(setMiembro)
        }
    },[token,idMiembro,idReceta,modoEdicion])

    function cambiarIngrediente(indice,campo,valor){
        setIngredientes(ingredientes.map( (ing,i) => i === indice ? { ...ing, [campo] : valor } : ing ))
    }

    function cambiarPaso(indice,texto){
        setPasos(pasos.map( (p,i) => i === indice ? { ...p, texto } : p ))
    }

    function elegirFotoPaso(indice,archivo){
        setPasos(pasos.map( (p,i) => i === indice ? { ...p, archivoNuevo : archivo } : p ))
    }

    function quitarFotoPaso(indice){
        setPasos(pasos.map( (p,i) => i === indice ? { ...p, foto : null, archivoNuevo : null } : p ))
    }

    function elegirArchivos(evento){
        let nuevos = [...archivos, ...Array.from(evento.target.files)].slice(0,6)
        setArchivos(nuevos)
        if(portadaIndice >= nuevos.length) setPortadaIndice(0)
        evento.target.value = "" // permite volver a elegir el mismo archivo
    }

    function quitarArchivo(indice){
        let nuevos = archivos.filter( (a,i) => i !== indice )
        setArchivos(nuevos)
        if(portadaIndice === indice) setPortadaIndice(0)
        else if(portadaIndice > indice) setPortadaIndice(portadaIndice - 1)
    }

    function manejarEnviar(evento){
        evento.preventDefault()

        if(enviando) return
        setError(false)

        let ingredientesLimpios = ingredientes
            .filter( ing => ing.nombre.trim() !== "" )
            .map( ing => ({
                cantidad : ing.cantidad === "" ? null : Number(ing.cantidad),
                unidad : ing.unidad,
                nombre : ing.nombre,
            }))

        let pasosLimpios = pasos.filter( p => p.texto.trim() !== "" )

        if(nombre.trim() === "" || ingredientesLimpios.length === 0 || pasosLimpios.length === 0){
            return setError(true)
        }
        if(ingredientesLimpios.some( ing => ing.cantidad !== null && (isNaN(ing.cantidad) || ing.cantidad < 0) )){
            return setError(true)
        }

        setEnviando(true)

        let datos = {
            nombre,
            tiempoMinutos : tiempo === "" ? null : Number(tiempo),
            categoria,
            temporada,
            ingredientes : ingredientesLimpios,
            // la foto pendiente de subir (archivoNuevo) no va aquí: se sube
            // aparte una vez la receta existe/está guardada (ver más abajo,
            // igual que con las fotos generales de la receta)
            pasos : pasosLimpios.map( p => ({ texto : p.texto.trim(), foto : p.foto || null }) ),
        }

        // sube las fotos de los pasos que tengan un archivo nuevo pendiente;
        // el índice usado es la posición dentro de pasosLimpios, que es el
        // mismo orden en el que se acaban de guardar en el servidor
        function subirFotosDePasos(idRecetaFinal){
            let subidas = pasosLimpios
                .map( (p,i) => ({ p, i }) )
                .filter( ({p}) => p.archivoNuevo )
                .map( ({p,i}) => {
                    let formData = new FormData()
                    formData.append("foto",p.archivoNuevo)
                    return subirFotoPasoReceta(idRecetaFinal,i,formData,token)
                })
            return subidas.length > 0
                ? Promise.all(subidas).catch(() => mostrarToast("La receta se ha guardado, pero no se han podido subir las fotos de los pasos", null))
                : Promise.resolve()
        }

        if(modoEdicion && !puedeEditar){
            // no se puede editar directo: se manda una sugerencia solo con
            // los campos de texto/listas que hayan cambiado (sin fotos)
            let textosPasos = pasosLimpios.map( p => p.texto.trim() )
            let textosPasosOriginales = (original.pasos || []).map( p => typeof p === "string" ? p : (p.texto || "") )

            let cambios = {}
            if(datos.nombre !== original.nombre) cambios.nombre = datos.nombre
            if(datos.tiempoMinutos !== original.tiempoMinutos) cambios.tiempoMinutos = datos.tiempoMinutos
            if(datos.categoria !== original.categoria) cambios.categoria = datos.categoria
            if(datos.temporada !== original.temporada) cambios.temporada = datos.temporada
            if(JSON.stringify(datos.ingredientes) !== JSON.stringify(original.ingredientes)) cambios.ingredientes = datos.ingredientes
            if(JSON.stringify(textosPasos) !== JSON.stringify(textosPasosOriginales)) cambios.pasos = textosPasos.map( texto => ({ texto }) )

            if(Object.keys(cambios).length === 0){
                setError(true)
                setEnviando(false)
                return
            }

            crearSugerencia({ tipo : "receta", idObjetivo : idReceta, cambios },token)
            .then(() => navigate(`/recetas/${idReceta}`,{ replace : true }))
            .catch(() => setError(true))
            .finally(() => setEnviando(false))
            return
        }

        if(modoEdicion){
            editarReceta(idReceta,datos,token)
            .then(() => {
                let promesaFotos = archivos.length === 0
                    ? Promise.resolve()
                    : (() => {
                        let formData = new FormData()
                        archivos.forEach( archivo => formData.append("fotos",archivo) )
                        formData.append("portadaIndice",portadaIndice)
                        return subirFotosReceta(idReceta,formData,token)
                            .catch(() => mostrarToast("La receta se ha guardado, pero no se han podido subir las fotos", null))
                    })()
                return promesaFotos
                    .then(() => subirFotosDePasos(idReceta))
                    .then(() => navigate(`/recetas/${idReceta}`,{ replace : true }))
            })
            .catch(() => setError(true))
            .finally(() => setEnviando(false))
        }else{
            crearReceta({
                familia : miembro.familia,
                autor : idMiembro,
                ...datos,
                dedicatoria : dedicatoria.trim() === "" ? undefined : dedicatoria,
            },token)
            .then( ({_id}) => {
                let promesaFotos = archivos.length === 0
                    ? Promise.resolve()
                    : (() => {
                        let formData = new FormData()
                        archivos.forEach( archivo => formData.append("fotos",archivo) )
                        formData.append("portadaIndice",portadaIndice)
                        return subirFotosReceta(_id,formData,token)
                            .catch(() => mostrarToast("La receta se ha guardado, pero no se han podido subir las fotos", null))
                    })()
                return promesaFotos
                    .then(() => subirFotosDePasos(_id))
                    .then(() => navigate(`/recetas/${_id}`,{ replace : true }))
            })
            .catch(() => setError(true))
            .finally(() => setEnviando(false))
        }
    }

    let [confirmandoBorrado,setConfirmandoBorrado] = useState(false)

    function confirmarBorrado(){
        setConfirmandoBorrado(false)
        let temporizador = setTimeout(() => { borrarReceta(idReceta,token).catch(() => {}) }, retrasoBorradoMs)
        mostrarToast(`Has borrado ${nombre || "la receta"}`, () => clearTimeout(temporizador))
        navigate(miembro ? `/miembros/${miembro._id}` : "/", { replace : true })
    }

    if(!token){
        return <Navigate to="/login"/>
    }

    if(!miembro){
        return <Cargando/>
    }

    return  <div className="max-w-2xl mx-auto p-5 flex flex-col gap-6">

                <div className="flex items-center justify-between">
                    <button onClick={ () => navigate(-1) } className="flex items-center gap-1 text-sm text-secondary hover:text-accent">
                        ← Volver
                    </button>
                </div>

                <div>
                    <h1 className="text-2xl">{modoEdicion ? (puedeEditar ? "Editar receta" : "Sugerir cambios") : "Nueva receta"}</h1>
                    {
                        !modoEdicion && miembro.nombreReal &&
                        <p className="text-sm text-grey">Se atribuirá a {miembro.nombreReal}</p>
                    }
                </div>

                {
                    modoEdicion && !puedeEditar &&
                    <AvisoSugerencia prefijo="Esta receta" creador={creador} />
                }

                <form onSubmit={manejarEnviar} className="flex flex-col gap-5">

                    <input
                        type="text"
                        value={nombre}
                        onChange={ evento => setNombre(evento.target.value) }
                        placeholder="Nombre de la receta"
                        className="border border-grey/40 rounded px-3 py-2 bg-form text-secondary focus:outline-none focus:border-accent"
                    />

                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                            <label htmlFor="dedicatoria" className="text-xs text-black">Dedicatoria (opcional)</label>
                            <span className="text-[10px] text-grey">{dedicatoria.length}/250</span>
                        </div>
                        <textarea
                            id="dedicatoria"
                            value={dedicatoria}
                            onChange={ evento => setDedicatoria(evento.target.value) }
                            maxLength={250}
                            rows="3"
                            placeholder="Recuerdo que este plato nos lo hacía la abuela las noches de verano en Málaga…"
                            className="border border-grey/40 rounded px-3 py-2 bg-form text-sm text-secondary resize-none focus:outline-none focus:border-accent"
                        />
                    </div>

                    {
                        (!modoEdicion || puedeEditar) &&
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg">Fotos</h2>
                                <p className="text-xs text-grey">Toca una para hacerla portada</p>
                            </div>
                            {
                                archivos.length > 0 &&
                                <div className="grid grid-cols-3 gap-2">
                                    {
                                        archivos.map( (archivo,i) =>
                                            <div key={i} className="relative">
                                                <img
                                                    src={URL.createObjectURL(archivo)}
                                                    alt=""
                                                    onClick={ () => setPortadaIndice(i) }
                                                    className={`w-full h-24 object-cover rounded-xl cursor-pointer ${portadaIndice === i ? "ring-2 ring-accent" : "opacity-80 hover:opacity-100"}`}
                                                />
                                                {
                                                    portadaIndice === i &&
                                                    <span className="absolute bottom-1 left-1 bg-accent text-primary text-[10px] px-1.5 py-0.5 rounded-full">Portada</span>
                                                }
                                                <button
                                                    type="button"
                                                    onClick={ () => quitarArchivo(i) }
                                                    aria-label="Quitar foto"
                                                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-secondary/70 text-primary text-xs flex items-center justify-center"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        )
                                    }
                                </div>
                            }
                            {
                                archivos.length < 6 &&
                                <label className="self-start text-sm text-accent hover:underline cursor-pointer">
                                    + Añadir fotos
                                    <input type="file" accept="image/*" multiple onChange={elegirArchivos} className="hidden" />
                                </label>
                            }
                        </div>
                    }

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="flex flex-col gap-1 text-xs text-black">
                            Tiempo (min)
                            <input
                                type="number"
                                min="0"
                                value={tiempo}
                                onChange={ evento => setTiempo(evento.target.value) }
                                className="border border-grey/40 rounded px-2 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-black">
                            Categoría
                            <select value={categoria} onChange={ evento => setCategoria(evento.target.value) } className="border border-grey/40 rounded px-2 py-2 bg-form text-sm text-secondary capitalize focus:outline-none focus:border-accent">
                                { categorias.map( c => <option key={c} value={c}>{c}</option> ) }
                            </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-black">
                            Estación
                            <select value={temporada} onChange={ evento => setTemporada(evento.target.value) } className="border border-grey/40 rounded px-2 py-2 bg-form text-sm text-secondary capitalize focus:outline-none focus:border-accent">
                                { temporadas.map( t => <option key={t} value={t}>{t}</option> ) }
                            </select>
                        </label>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg">Ingredientes</h2>
                            <p className="text-xs text-grey">Cantidades para 1 ración</p>
                        </div>
                        {
                            ingredientes.map( (ingrediente,i) =>
                                <div key={i} className="flex gap-2 flex-wrap">
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={ingrediente.cantidad}
                                        onChange={ evento => cambiarIngrediente(i,"cantidad",evento.target.value) }
                                        placeholder="Cant."
                                        className="w-20 border border-grey/40 rounded px-2 py-1.5 bg-form text-sm focus:outline-none focus:border-accent"
                                    />
                                    <input
                                        type="text"
                                        value={ingrediente.unidad}
                                        onChange={ evento => cambiarIngrediente(i,"unidad",evento.target.value) }
                                        placeholder="ud."
                                        className="w-16 border border-grey/40 rounded px-2 py-1.5 bg-form text-sm focus:outline-none focus:border-accent"
                                    />
                                    <input
                                        type="text"
                                        value={ingrediente.nombre}
                                        onChange={ evento => cambiarIngrediente(i,"nombre",evento.target.value) }
                                        placeholder="Ingrediente (deja la cantidad vacía si es 'al gusto')"
                                        className="flex-1 border border-grey/40 rounded px-2 py-1.5 bg-form text-sm focus:outline-none focus:border-accent"
                                    />
                                    <button
                                        type="button"
                                        onClick={ () => setIngredientes(ingredientes.filter( (x,j) => j !== i )) }
                                        disabled={ingredientes.length === 1}
                                        aria-label="Quitar ingrediente"
                                        className="text-grey hover:text-accent disabled:opacity-30 px-1"
                                    >
                                        ✕
                                    </button>
                                    {
                                        ingrediente.nombre.trim() !== "" &&
                                        <p className="w-full text-xs text-grey -mt-1 pl-1 basis-full">
                                            → {textoIngrediente(ingrediente.cantidad, ingrediente.unidad, ingrediente.nombre)}
                                        </p>
                                    }
                                </div>
                            )
                        }
                        <button
                            type="button"
                            onClick={ () => setIngredientes([...ingredientes,{ cantidad : "", unidad : "", nombre : "" }]) }
                            className="self-start text-sm text-accent hover:underline"
                        >
                            + Añadir ingrediente
                        </button>
                    </div>

                    <div className="flex flex-col gap-2">
                        <h2 className="text-lg">Preparación</h2>
                        {
                            pasos.map( (paso,i) =>
                                <div key={i} className="flex flex-col gap-1.5">
                                    <div className="flex gap-2 items-start">
                                        <span className="w-6 h-6 rounded-full border border-grey/50 text-grey text-xs flex items-center justify-center shrink-0 mt-1.5">{i + 1}</span>
                                        <textarea
                                            value={paso.texto}
                                            onChange={ evento => cambiarPaso(i,evento.target.value) }
                                            placeholder={`Paso ${i + 1}`}
                                            rows="2"
                                            className="flex-1 border border-grey/40 rounded px-2 py-1.5 bg-form text-sm resize-y focus:outline-none focus:border-accent"
                                        />
                                        <button
                                            type="button"
                                            onClick={ () => setPasos(pasos.filter( (x,j) => j !== i )) }
                                            disabled={pasos.length === 1}
                                            aria-label="Quitar paso"
                                            className="text-grey hover:text-accent disabled:opacity-30 px-1 mt-1.5"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    {
                                        (!modoEdicion || puedeEditar) &&
                                        <div className="flex items-center gap-2 pl-9">
                                            {
                                                paso.archivoNuevo
                                                ? <div className="relative w-16 h-16 shrink-0">
                                                        <img src={URL.createObjectURL(paso.archivoNuevo)} alt="" className="w-full h-full object-cover rounded-lg" />
                                                        <button
                                                            type="button"
                                                            onClick={ () => quitarFotoPaso(i) }
                                                            aria-label="Quitar foto del paso"
                                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-secondary/70 text-primary text-xs flex items-center justify-center"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                : paso.foto
                                                    ? <div className="relative w-16 h-16 shrink-0">
                                                            <img src={urlFoto(paso.foto)} alt="" className="w-full h-full object-cover rounded-lg" />
                                                            <button
                                                                type="button"
                                                                onClick={ () => quitarFotoPaso(i) }
                                                                aria-label="Quitar foto del paso"
                                                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-secondary/70 text-primary text-xs flex items-center justify-center"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    : <label className="text-xs text-accent hover:underline cursor-pointer">
                                                            + Añadir foto (opcional)
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                onChange={ evento => {
                                                                    let f = evento.target.files[0]
                                                                    if(f) elegirFotoPaso(i,f)
                                                                    evento.target.value = ""
                                                                } }
                                                                className="hidden"
                                                            />
                                                        </label>
                                            }
                                        </div>
                                    }
                                </div>
                            )
                        }
                        <button
                            type="button"
                            onClick={ () => setPasos([...pasos,{ texto : "", foto : null, archivoNuevo : null }]) }
                            className="self-start text-sm text-accent hover:underline"
                        >
                            + Añadir paso
                        </button>
                    </div>

                    {
                        error ? <p className="text-red-600 text-sm">Revisa los datos: hace falta nombre, al menos un ingrediente y un paso</p> : null
                    }

                    <input
                        type="submit"
                        value={enviando ? "Guardando…" : (modoEdicion ? (puedeEditar ? "Guardar cambios" : "Enviar sugerencia") : "Guardar receta")}
                        disabled={enviando}
                        className="bg-accent text-primary uppercase tracking-wide rounded px-4 py-2.5 cursor-pointer hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    {
                        modoEdicion && puedeEditar &&
                        <button type="button" onClick={ () => setConfirmandoBorrado(true) } className="text-sm text-red-500 hover:text-red-700 self-center">Borrar receta</button>
                    }

                </form>

            {
                confirmandoBorrado &&
                <ModalConfirmar
                    titulo="Borrar receta"
                    mensaje="¿Borrar esta receta? Esta acción no se puede deshacer."
                    onConfirmar={confirmarBorrado}
                    onCerrar={ () => setConfirmandoBorrado(false) }
                />
            }
            </div>
}

export default CrearReceta
