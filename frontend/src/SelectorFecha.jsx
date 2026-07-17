import { useState } from "react"

const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]

// nº de días del mes indicado; si falta año o mes, se asume el máximo (31)
// para no bloquear al usuario mientras todavía no ha elegido los tres campos
function diasEnMes(anio,mes){
    if(!anio || !mes) return 31
    return new Date(anio,mes,0).getDate()
}

// value/onChange usan el mismo formato "YYYY-MM-DD" (o "") que <input type="date">,
// así que sustituye a ese input sin tocar el resto del formulario.
// Se usa en vez del selector nativo porque para fechas de nacimiento lejanas
// obliga a retroceder mes a mes (o año a año) muy despacio; con tres <select>
// se puede escribir el año directamente y saltar al momento.
//
// día/mes/año se guardan en estado propio (no solo derivados de "value"):
// mientras el usuario no ha elegido los tres, "value" hacia fuera es "" y
// si derivásemos directamente de ahí, cada selección parcial se borraría
// sola en el siguiente render. Solo cuando los tres campos están completos
// se emite la fecha; hasta entonces cada elección se queda guardada aquí.
// El valor inicial solo se lee de "value" al montar: en los dos sitios
// donde se usa este componente, el formulario entero se monta de cero
// cada vez que se abre, así que no hace falta resincronizar más tarde.
function SelectorFecha({ value, onChange, className = "" }){

    let inicial = value ? value.split("-").map(Number) : [null,null,null]
    let [anio,setAnio] = useState(inicial[0] || null)
    let [mes,setMes] = useState(inicial[1] || null)
    let [dia,setDia] = useState(inicial[2] || null)

    let anioActual = new Date().getFullYear()
    let anios = []
    for(let a = anioActual; a >= anioActual - 120; a--) anios.push(a)

    let dias = Array.from({ length : diasEnMes(anio,mes) },(_,i) => i + 1)

    function emitir(nuevoAnio,nuevoMes,nuevoDia){
        setAnio(nuevoAnio)
        setMes(nuevoMes)
        setDia(nuevoDia)
        onChange((nuevoAnio && nuevoMes && nuevoDia)
            ? `${nuevoAnio}-${String(nuevoMes).padStart(2,"0")}-${String(nuevoDia).padStart(2,"0")}`
            : "")
    }

    return  <div className={`flex gap-2 ${className}`}>
                <select
                    value={dia || ""}
                    onChange={ evento => emitir(anio,mes,evento.target.value ? Number(evento.target.value) : null) }
                    className="w-16 min-w-0 border border-grey/40 rounded px-2 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent"
                >
                    <option value="">Día</option>
                    { dias.map( d => <option key={d} value={d}>{d}</option> ) }
                </select>
                <select
                    value={mes || ""}
                    onChange={ evento => {
                        let nuevoMes = evento.target.value ? Number(evento.target.value) : null
                        emitir(anio,nuevoMes, dia ? Math.min(dia,diasEnMes(anio,nuevoMes)) : dia)
                    } }
                    className="flex-1 min-w-0 border border-grey/40 rounded px-2 py-2 bg-form text-sm text-secondary capitalize focus:outline-none focus:border-accent"
                >
                    <option value="">Mes</option>
                    { meses.map( (nombre,i) => <option key={i} value={i + 1}>{nombre}</option> ) }
                </select>
                <select
                    value={anio || ""}
                    onChange={ evento => {
                        let nuevoAnio = evento.target.value ? Number(evento.target.value) : null
                        emitir(nuevoAnio,mes, dia ? Math.min(dia,diasEnMes(nuevoAnio,mes)) : dia)
                    } }
                    className="w-20 min-w-0 border border-grey/40 rounded px-2 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent"
                >
                    <option value="">Año</option>
                    { anios.map( a => <option key={a} value={a}>{a}</option> ) }
                </select>
            </div>
}

export default SelectorFecha
