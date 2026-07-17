import { useState } from "react"
import Modal from "./Modal"
import VisorFoto from "./VisorFoto"
import { aceptarSugerencia, rechazarSugerencia, urlFoto } from "./api"

function formatearFecha(fecha){
    if(!fecha) return "Sin especificar"
    return new Date(fecha).toLocaleDateString("es-ES",{ day : "numeric", month : "short", year : "numeric" })
}

function textoIngrediente(ing){
    if(!ing) return ""
    if(ing.cantidad === "" || ing.cantidad === null || ing.cantidad === undefined){
        return ing.nombre
    }
    if(!ing.unidad || ing.unidad.trim() === ""){
        return `${ing.cantidad} ${ing.nombre}`
    }
    return `${ing.cantidad} ${ing.unidad} de ${ing.nombre}`
}

// nombres legibles de cada campo, según el tipo de objetivo
let etiquetas = {
    nombreReal : "Nombre",
    nombre : "Nombre",
    fechaNacimiento : "Fecha de nacimiento",
    foto : "Foto",
    tiempoMinutos : "Tiempo de preparación",
    categoria : "Categoría",
    temporada : "Temporada",
    ingredientes : "Ingredientes",
    pasos : "Preparación",
}

// modal de comparación "Ahora" vs "Sugiere cambiar a" para una sugerencia
// pendiente, con botones de aceptar/rechazar
function ModalSugerencia({ sugerencia, token, onCerrar, onResuelta }){

    let [procesando,setProcesando] = useState(false)
    let [fotoAmpliada,setFotoAmpliada] = useState(null) // url o null

    function manejarAceptar(){
        if(procesando) return
        setProcesando(true)
        aceptarSugerencia(sugerencia._id,token)
        .then(() => onResuelta(sugerencia._id))
        .catch(() => setProcesando(false))
    }

    function manejarRechazar(){
        if(procesando) return
        setProcesando(true)
        rechazarSugerencia(sugerencia._id,token)
        .then(() => onResuelta(sugerencia._id))
        .catch(() => setProcesando(false))
    }

    function renderValor(campo, valor){
        if(campo === "foto"){
            return valor
                ? <img
                    src={urlFoto(valor)}
                    alt=""
                    onClick={ () => setFotoAmpliada(urlFoto(valor)) }
                    className="w-16 h-16 rounded-full object-cover cursor-zoom-in"
                  />
                : <span className="text-grey text-sm">Sin foto</span>
        }
        if(campo === "fechaNacimiento"){
            return <span className="text-sm">{formatearFecha(valor)}</span>
        }
        if(campo === "tiempoMinutos"){
            return <span className="text-sm">{valor != null ? `${valor} min` : "Sin especificar"}</span>
        }
        if(campo === "categoria" || campo === "temporada"){
            return <span className="text-sm capitalize">{valor || "—"}</span>
        }
        if(campo === "ingredientes"){
            return  <ul className="text-sm list-disc list-inside">
                        {(valor || []).map( (ing,i) => <li key={i}>{textoIngrediente(ing)}</li> )}
                    </ul>
        }
        if(campo === "pasos"){
            return  <ol className="text-sm list-decimal list-inside">
                        {(valor || []).map( (paso,i) => <li key={i}>{typeof paso === "string" ? paso : paso.texto}</li> )}
                    </ol>
        }
        return <span className="text-sm">{valor || "—"}</span>
    }

    let campos = Object.keys(sugerencia.cambios)

    return  <>
                <Modal onCerrar={onCerrar}>
                    <h2 className="font-display text-[1.425rem] font-semibold">Sugerencia de cambio</h2>
                    <p className="text-sm text-grey">{sugerencia.texto}</p>

                    <div className="flex flex-col gap-4 max-h-80 overflow-y-auto sin-scrollbar">
                        {
                            campos.map( campo =>
                                <div key={campo} className="flex flex-col gap-2 border-t border-grey/20 pt-3">
                                    <p className="text-xs uppercase tracking-wide text-grey">{etiquetas[campo] || campo}</p>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[11px] text-grey">Ahora</span>
                                        {renderValor(campo, sugerencia.actual[campo])}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[11px] text-accent">Sugiere cambiar a</span>
                                        {renderValor(campo, sugerencia.cambios[campo])}
                                    </div>
                                </div>
                            )
                        }
                    </div>

                    <div className="flex gap-2 justify-end pt-2">
                        <button onClick={manejarRechazar} disabled={procesando} className="text-sm text-grey hover:text-red-600 px-4 py-2 disabled:opacity-50">
                            Rechazar
                        </button>
                        <button onClick={manejarAceptar} disabled={procesando} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60">
                            {procesando ? "..." : "Aceptar"}
                        </button>
                    </div>
                </Modal>

                {
                    fotoAmpliada &&
                    <VisorFoto src={fotoAmpliada} alt="" onCerrar={ () => setFotoAmpliada(null) } />
                }
            </>
}

export default ModalSugerencia
