import { useState, useEffect } from "react"
import Modal from "./Modal"

// Modal genérico para generar y compartir un enlace de invitación.
// generarFn debe devolver una promesa que resuelva a { token }.
function ModalCompartirEnlace({ titulo, descripcion, generarFn, rutaBase, onCerrar }){

    let [token,setToken] = useState(null)
    let [error,setError] = useState(false)
    let [copiado,setCopiado] = useState(false)

    useEffect(() => {
        generarFn()
        .then( ({token}) => setToken(token) )
        .catch(() => setError(true))
    },[])

    let enlace = token ? `${window.location.origin}${rutaBase}/${token}` : ""

    function copiar(){
        navigator.clipboard.writeText(enlace)
        .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) })
        .catch(() => {})
    }

    return  <Modal onCerrar={onCerrar}>
                <h2 className="font-display text-[1.425rem] font-semibold">{titulo}</h2>
                <p className="text-sm text-grey">{descripcion}</p>
                {
                    error
                    ? <p className="text-red-600 text-sm">No se ha podido generar el enlace.</p>
                    : !token
                        ? <p className="text-sm text-grey">Generando enlace…</p>
                        : <div className="flex flex-col gap-2">
                            <div className="border border-grey/40 rounded-lg px-3 py-2 bg-white text-xs text-secondary break-all">
                                {enlace}
                            </div>
                            <button onClick={copiar} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90">
                                {copiado ? "¡Copiado!" : "Copiar enlace"}
                            </button>
                          </div>
                }
            </Modal>
}

export default ModalCompartirEnlace
