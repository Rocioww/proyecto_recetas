import { useState } from "react"

const frases = [
    "Comprando ingredientes…",
    "Precalentando el horno…",
    "Removiendo el estofado…",
    "Afilando los cuchillos…",
    "Amasando la masa…",
    "Colando el caldo…",
    "Probando el punto de sal…",
    "Buscando la receta de la abuela…",
    "Encendiendo los fogones…",
    "Emplatando…",
]

// indicador de carga: spinner + frase temática debajo. "chico" lo hace más
// compacto, para usarlo dentro de una sección o un modal en vez de a
// pantalla completa.
function Cargando({ chico }){
    let [frase] = useState( () => frases[ Math.floor(Math.random() * frases.length) ] )

    return  <div className={`flex flex-col items-center justify-center gap-2 ${chico ? "py-8" : "min-h-[50vh]"}`} role="status" aria-label="Cargando">
                <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin"></div>
                <p className="text-sm text-grey">{frase}</p>
            </div>
}

export default Cargando
