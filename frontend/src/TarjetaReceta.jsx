import { useState, useContext } from "react"
import { Link } from "react-router-dom"
import ModalGuardarEnColeccion from "./ModalGuardarEnColeccion"
import ToastContexto from "./ToastContexto"
import { marcarFavorito, desmarcarFavorito, quitarRecetaDeColeccion, urlFoto } from "./api"

// tarjeta de receta reutilizada en todas las listas (Inicio, Árbol,
// Favoritos, perfil propio/de un miembro, buscador, colección). Arriba a
// la derecha lleva corazón (favorito) y guardado (colección), para poder
// marcarlos sin entrar en la receta.
//
// modoColeccion: si se pasa { onQuitar }, la tarjeta se está mostrando
// DENTRO de una colección propia concreta: el icono de guardado se
// muestra siempre relleno (la receta está, por definición, en esta
// colección) y al pulsarlo se llama a onQuitar en vez de abrir el
// selector de colecciones — misma función que antes tenía el icono de
// papelera, solo que ahora es el propio icono de guardado.
//
// onFavoritoCambiado(receta, nuevoValor): opcional, para cuando la propia
// lista donde se pinta la tarjeta ES la de favoritos (Favoritos.jsx "Todos"):
// al quitar el corazón, la página puede sacar la receta de la lista al
// momento en vez de dejarla ahí con el corazón vacío hasta recargar.
function TarjetaReceta({ receta, token, mostrarFamilia, modoColeccion, onFavoritoCambiado }){

    let { mostrarToast } = useContext(ToastContexto)

    let [favorita,setFavorita] = useState(!!receta.esFavorita)
    let [guardada,setGuardada] = useState(!!receta.estaGuardada)
    let [guardarAbierto,setGuardarAbierto] = useState(false)

    function alternarFavorito(){
        let nuevo = !favorita
        setFavorita(nuevo) // optimista: se ve al instante
        let promesa = nuevo ? marcarFavorito(receta._id,token) : desmarcarFavorito(receta._id,token)
        promesa
        .then(() => { if(onFavoritoCambiado) onFavoritoCambiado(receta,nuevo) })
        .catch(() => setFavorita(!nuevo)) // si falla, se deshace
    }

    function alClicGuardado(){
        if(modoColeccion){
            modoColeccion.onQuitar(receta)
            return
        }
        setGuardarAbierto(true)
    }

    function alGuardarEnColeccion(coleccion){
        setGuardada(true)
        mostrarToast(`Has añadido la receta a la colección ${coleccion.nombre}`, () => {
            quitarRecetaDeColeccion(coleccion._id,receta._id,token).catch(() => {})
            setGuardada(false)
        })
    }

    let guardadoRelleno = modoColeccion ? true : guardada

    return  <div className="relative">
                <Link to={`/recetas/${receta._id}`} className="block bg-white rounded-2xl shadow hover:shadow-md transition-shadow overflow-hidden">
                    {
                        (receta.portada || (receta.fotos && receta.fotos[0]))
                        ? <img src={urlFoto(receta.portada || receta.fotos[0])} alt="" className="w-full h-32 object-cover" />
                        : <div className="w-full h-32 bg-accent2/20 flex items-center justify-center text-3xl">🍲</div>
                    }
                    <div className="p-3 flex flex-col gap-1.5">
                        <p className="font-display font-semibold text-[1.3rem] leading-snug truncate">{receta.nombre}</p>
                        {
                            receta.autorInfo &&
                            <div className="flex items-center gap-1.5">
                                {
                                    receta.autorInfo.foto
                                    ? <img src={urlFoto(receta.autorInfo.foto)} alt="" className="w-5 h-5 rounded-full object-cover" />
                                    : <div className="w-5 h-5 rounded-full bg-accent2/40 flex items-center justify-center leading-none text-[9px] font-semibold text-secondary">{(receta.autorInfo.nombreReal||"?")[0].toUpperCase()}</div>
                                }
                                <p className="text-[11px] text-grey truncate">{receta.autorInfo.nombreReal}</p>
                            </div>
                        }
                        {
                            receta.tiempoMinutos != null &&
                            <p className="text-xs text-grey">⏱ {receta.tiempoMinutos} min</p>
                        }
                        <div className="flex gap-1.5 flex-wrap">
                            {
                                mostrarFamilia && receta.nombreFamilia &&
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-accent2/20 text-secondary truncate max-w-full">{receta.nombreFamilia}</span>
                            }
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary border border-grey/30 capitalize">{receta.categoria}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary border border-grey/30 capitalize">{receta.temporada}</span>
                        </div>
                    </div>
                </Link>

                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    <button
                        onClick={alternarFavorito}
                        aria-label={favorita ? "Quitar de favoritos" : "Guardar en favoritos"}
                        className="w-9 h-9 rounded-full bg-primary/90 flex items-center justify-center shadow text-secondary hover:text-accent"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill={favorita ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={favorita ? "text-accent" : ""}><path d="M12 20.5s-7.5-4.7-9.3-9.4C1.4 7.6 3.6 4.5 6.8 4.5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.2 0 5.4 3.1 4.1 6.6-1.8 4.7-9.3 9.4-9.3 9.4Z"/></svg>
                    </button>
                    <button
                        onClick={alClicGuardado}
                        aria-label={modoColeccion ? "Quitar de la colección" : (guardada ? "Guardado en una colección" : "Guardar en una colección")}
                        className="w-9 h-9 rounded-full bg-primary/90 flex items-center justify-center shadow text-secondary hover:text-accent"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill={guardadoRelleno ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={guardadoRelleno ? "text-accent" : ""}><path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg>
                    </button>
                </div>

                {
                    guardarAbierto &&
                    <ModalGuardarEnColeccion
                        idReceta={receta._id}
                        token={token}
                        onCerrar={ () => setGuardarAbierto(false) }
                        onGuardado={alGuardarEnColeccion}
                        onQuitado={ () => setGuardada(false) }
                    />
                }
            </div>
}

export default TarjetaReceta
