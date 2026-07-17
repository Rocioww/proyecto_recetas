// ============================================================
//  Layout del árbol genealógico
// ============================================================
//
//  Reglas visuales:
//    pareja       -> misma fila, a la DERECHA, hueco pequeño
//    descendiente -> fila de abajo, centrados bajo el centro del par
//    progenitor   -> fila de arriba, centrados sobre el primario
//    hermano      -> misma fila, a la IZQUIERDA, hueco grande
//
//  Garantías:
//    - Ningún miembro queda entre los dos miembros de una pareja.
//    - Los hijos se centran bajo el par (no solo bajo el primario).
//    - El conector de hermanos va por ARRIBA (no por abajo).
//    - Los hijos de un mismo par se unen con un conector en T compartido.

const anchoTarjeta = 160
const altoTarjeta  = 180 // foto (mitad superior) + nombre/relación/recetas centrados debajo
const huecoXGrupo = 160          // espacio entre grupos distintos (hermanos, hijos, ramas)
const huecoX       = huecoXGrupo / 2   // espacio entre los dos miembros de una pareja: siempre la mitad
const huecoY       = 120
const altoFila     = altoTarjeta + huecoY

function clusterBase(id){
    return {
        cards : { [id] : { x : 0, fila : 0 } },
        filas : { 0 : [0, anchoTarjeta] },
    }
}

function extenderIntervalo(cluster, fila, min, max){
    if(!cluster.filas[fila]){
        cluster.filas[fila] = [min, max]
    } else {
        cluster.filas[fila][0] = Math.min(cluster.filas[fila][0], min)
        cluster.filas[fila][1] = Math.max(cluster.filas[fila][1], max)
    }
}

function fusionar(destino, fuente, dx, dfila){
    Object.entries(fuente.cards).forEach( ([id,c]) => {
        destino.cards[id] = { x : c.x + dx, fila : c.fila + dfila }
    })
    Object.entries(fuente.filas).forEach( ([fila,intervalo]) => {
        extenderIntervalo(destino, Number(fila) + dfila, intervalo[0] + dx, intervalo[1] + dx)
    })
}

// dx mínimo para colocar "fuente" a la DERECHA de "destino" sin colisión
function dxEmpujeDerecha(destino, fuente, dfila, dxDeseado, hueco = huecoX){
    let dx = dxDeseado
    Object.entries(fuente.filas).forEach( ([fila,intervalo]) => {
        let f = Number(fila) + dfila
        if(destino.filas[f]){
            dx = Math.max(dx, destino.filas[f][1] + hueco - intervalo[0])
        }
    })
    return dx
}

// dx máximo para colocar "fuente" a la IZQUIERDA de "destino" sin colisión
function dxEmpujeIzquierda(destino, fuente, dfila, dxDeseado, hueco = huecoX){
    let dx = dxDeseado
    Object.entries(fuente.filas).forEach( ([fila,intervalo]) => {
        let f = Number(fila) + dfila
        if(destino.filas[f]){
            dx = Math.min(dx, destino.filas[f][0] - hueco - intervalo[1])
        }
    })
    return dx
}

// empaqueta clusters lado a lado; devuelve el grupo y el centro X de cada
// cluster dentro del grupo. Por defecto ese centro es el de la tarjeta raíz
// (p.ej. un hijo con pareja propia no debe desplazar dónde se centran SUS
// padres: la pareja del hijo solo va al lado, no cuenta para el centrado).
// Con centrarPorFila=true, en cambio, se usa sub.centroPropio (raíz + SU
// PROPIA pareja real, ver construirCluster): esto hace falta al subir a
// progenitores, donde un abuelo con pareja sí debe repartir a sus hijos
// entre los dos. sub.filas[0] no sirve para esto: un progenitor puede
// traer consigo hermanos ajenos de la raíz (ver el bloque "hermanos" del
// paso 3 en construirCluster), que quedan colocados a su IZQUIERDA
// precisamente para no interferir con la colisión/centrado por la derecha
// que se hace aquí.
// Por defecto usa el hueco GRANDE (grupos distintos); se le puede pasar el
// hueco pequeño cuando los clusters forman en realidad una pareja (p.ej.
// los dos progenitores)
function empaquetarLadoALado(clusters, idsRaiz, hueco = huecoXGrupo, centrarPorFila = false){
    let grupo = { cards : {}, filas : {} }
    let centros = []
    clusters.forEach( (sub,i) => {
        let dx = Object.keys(grupo.filas).length === 0
            ? 0
            : dxEmpujeDerecha(grupo, sub, 0, -Infinity, hueco)
        fusionar(grupo, sub, dx, 0)
        centros.push(
            centrarPorFila
                ? sub.centroPropio + dx
                : grupo.cards[idsRaiz[i]].x + anchoTarjeta / 2
        )
    })
    return { grupo, centros }
}

// orientacion: hacia qué lado debe crecer todo lo que "id" traiga consigo
// y no pertenezca directamente a su propia pareja (en concreto, los
// hermanos heredados de un progenitor, ver el paso 3). Por defecto
// "izquierda" (coincide con id siendo el miembro de referencia, x=0 local);
// quien llama a construirCluster pasa "derecha" cuando construye a alguien
// que va a quedar al lado DERECHO de otra persona (su pareja real, o el
// segundo progenitor de un hijo), para que crezca alejándose de ella y no
// quede su propia familia atrapada entre los dos.
// esRaiz: solo es true para la persona raíz del árbol (Tú). A diferencia
// de cualquier otro "id", a la raíz no la va a fusionar nadie más por
// fuera después (es el final de la recursión), así que sus propios
// hermanos heredados SÍ se pueden repartir a ambos lados: la raíz queda
// centrada entre ellos en vez de siempre pegada a un extremo.
function construirCluster(id, adyacencia, orientacion = "izquierda", esRaiz = false){
    let cluster = clusterBase(id)
    let colgantes = adyacencia[id] || []

    // 1) PAREJAS primero (necesario para calcular el centro del par
    //    antes de colocar descendientes y progenitores)
    let idPareja = null
    colgantes.filter( c => c.tipo === "pareja" ).forEach( p => {
        idPareja = p.id
        let sub = construirCluster(p.id, adyacencia, "derecha")
        let dx = dxEmpujeDerecha(cluster, sub, 0, -Infinity, huecoX)
        fusionar(cluster, sub, dx, 0)
    })

    // centro horizontal del par (id + pareja/s) en la fila 0
    // En este momento fila 0 solo contiene id y sus parejas
    let centroPareja = cluster.filas[0]
        ? (cluster.filas[0][0] + cluster.filas[0][1]) / 2
        : anchoTarjeta / 2

    // 2) DESCENDIENTES centrados bajo el centro del par
    let descendientes = colgantes.filter( c => c.tipo === "descendiente" )
    if(descendientes.length > 0){
        let subclusters = descendientes.map( d => construirCluster(d.id, adyacencia) )
        let { grupo, centros } = empaquetarLadoALado(subclusters, descendientes.map( d => d.id ))
        let mid = (Math.min(...centros) + Math.max(...centros)) / 2
        let dx = dxEmpujeDerecha(cluster, grupo, 1, centroPareja - mid)

        // si evitar colisiones obligó a desplazar a los hijos más allá del
        // centro deseado, el cluster de los padres (ya construido) tiene que
        // recorrer esa misma diferencia para seguir quedando centrado sobre
        // el nuevo centro real de los hijos
        let nuevoCentroHijos = mid + dx
        if(nuevoCentroHijos > centroPareja){
            let diff = nuevoCentroHijos - centroPareja
            Object.values(cluster.cards).forEach( c => { c.x += diff })
            Object.values(cluster.filas).forEach( intervalo => {
                intervalo[0] += diff
                intervalo[1] += diff
            })
        }

        fusionar(cluster, grupo, dx, 1)
    }

    // 3) PROGENITORES centrados sobre el primario (id), no sobre el par,
    //    porque son los padres de id, no de la pareja
    let ordenGenero = { M : 0, X : 1, F : 2 }
    let progenitores = colgantes
        .filter( c => c.tipo === "progenitor" )
        .sort( (a,b) => (ordenGenero[a.genero] ?? 1) - (ordenGenero[b.genero] ?? 1) )
    if(progenitores.length > 0){
        // el progenitor de índice 0 (M, por el orden de género) queda a la
        // IZQUIERDA de su pareja; el segundo (F) a la DERECHA. Cada uno se
        // construye con esa orientación para que, si a su vez trae consigo
        // hermanos propios (ver más abajo), crezcan alejándose del otro
        // progenitor en vez de invadir el hueco entre ambos
        let subclusters = progenitores.map( (p,i) => construirCluster(p.id, adyacencia, i === 0 ? "izquierda" : "derecha") )
        // los progenitores de un mismo hijo forman una pareja: hueco pequeño
        // entre ellos. centrarPorFila=true: si uno de ellos tiene a su vez
        // su propia pareja ya fusionada (p.ej. un abuelo con pareja), sus
        // hijos deben repartirse sobre los DOS, no solo sobre él
        let { grupo, centros } = empaquetarLadoALado(subclusters, progenitores.map( p => p.id ), huecoX, true)
        let mid = (Math.min(...centros) + Math.max(...centros)) / 2
        // centro real de id: puede haberse desplazado en el paso 2 (DESCENDIENTES)
        // para recentrar los padres bajo sus hijos, así que no se puede asumir x=0
        let centroId = cluster.cards[id].x + anchoTarjeta / 2

        // un progenitor puede traer consigo, en su propia fila 1 (relativa),
        // a OTROS hijos suyos: son hermanos de "id" descubiertos por esa
        // rama (p.ej. "añadir hermano" cuelga del progenitor). Esos
        // aterrizan en la fila 0, junto a "id". Se separan del resto de
        // "grupo" (los padres) para colocarlos hacia la "orientacion" de
        // "id" (la que se le pasó a ESTE construirCluster): si se dejaran
        // fusionados con los padres y empujados hacia el lado de la pareja
        // de "id", acabarían entre "id" y esa pareja, como si los tres
        // formaran parte de la misma pareja.
        let hermanos = null
        if(grupo.filas[1]){
            hermanos = { cards : {}, filas : {} }
            Object.entries(grupo.cards).forEach( ([cid,c]) => {
                if(c.fila < 1) return
                hermanos.cards[cid] = { x : c.x, fila : c.fila - 1 }
                delete grupo.cards[cid]
            })
            Object.entries(grupo.filas).forEach( ([fila,intervalo]) => {
                if(Number(fila) < 1) return
                hermanos.filas[Number(fila) - 1] = intervalo
                delete grupo.filas[fila]
            })
        }

        // los padres (ya sin los hermanos que trajeran) se centran sobre "id"
        let dx = dxEmpujeDerecha(cluster, grupo, -1, centroId - mid, huecoX)
        fusionar(cluster, grupo, dx, -1)

        if(hermanos && esRaiz){
            // la raíz no la fusiona nadie más por fuera después: sus
            // hermanos heredados se reparten a ambos lados (mitad y mitad)
            // para que la raíz quede centrada entre ellos, en vez de
            // siempre pegada a un extremo.
            // Las entradas de fila 0 pueden ser tanto raíces de hermano
            // como la propia pareja de un hermano (también cae en fila 0):
            // se agrupan por proximidad (hueco pequeño = misma pareja,
            // hueco grande = hermano distinto) para no separar nunca a un
            // hermano de SU pareja al repartir
            let filaCero = Object.entries(hermanos.cards)
                .filter( ([,c]) => c.fila === 0 )
                .sort( (a,b) => a[1].x - b[1].x )
            let umbralGrupo = (huecoX + huecoXGrupo) / 2
            let gruposRaiz = []
            filaCero.forEach( ([cid,c]) => {
                let grupoActual = gruposRaiz[gruposRaiz.length - 1]
                let finGrupo = grupoActual && Math.max(...grupoActual.map( id => hermanos.cards[id].x + anchoTarjeta ))
                if(grupoActual && c.x - finGrupo < umbralGrupo){
                    grupoActual.push(cid)
                } else {
                    gruposRaiz.push([cid])
                }
            })

            let mitad = Math.ceil(gruposRaiz.length / 2)
            let idsIzquierda = new Set(gruposRaiz.slice(0, mitad).flat())
            let idsDerecha = new Set(gruposRaiz.slice(mitad).flat())
            let raices = filaCero.map( ([cid]) => cid )

            // un descendiente de un hermano (no su fila 0) se reparte con
            // la entrada de fila 0 más próxima en horizontal
            function ladoDe(cid, c){
                if(idsIzquierda.has(cid)) return "izquierda"
                if(idsDerecha.has(cid)) return "derecha"
                let masCercana = raices.reduce( (mejor,rid) =>
                    Math.abs(hermanos.cards[rid].x - c.x) < Math.abs(hermanos.cards[mejor].x - c.x) ? rid : mejor
                )
                return idsIzquierda.has(masCercana) ? "izquierda" : "derecha"
            }

            function extraerLado(lado){
                let sub = { cards : {}, filas : {} }
                Object.entries(hermanos.cards).forEach( ([cid,c]) => {
                    if(ladoDe(cid,c) !== lado) return
                    sub.cards[cid] = c
                    extenderIntervalo(sub, c.fila, c.x, c.x + anchoTarjeta)
                })
                return Object.keys(sub.cards).length > 0 ? sub : null
            }

            let hermanosIzq = extraerLado("izquierda")
            let hermanosDer = extraerLado("derecha")
            let extremos = [centroId - anchoTarjeta / 2, centroId + anchoTarjeta / 2]

            if(hermanosIzq){
                let dxIzq = dxEmpujeIzquierda(cluster, hermanosIzq, 0, Infinity, huecoXGrupo)
                fusionar(cluster, hermanosIzq, dxIzq, 0)
                extremos.push(hermanosIzq.filas[0][0] + dxIzq, hermanosIzq.filas[0][1] + dxIzq)
            }
            if(hermanosDer){
                let dxDer = dxEmpujeDerecha(cluster, hermanosDer, 0, -Infinity, huecoXGrupo)
                fusionar(cluster, hermanosDer, dxDer, 0)
                extremos.push(hermanosDer.filas[0][0] + dxDer, hermanosDer.filas[0][1] + dxDer)
            }

            let centroGrupoHijos = (Math.min(...extremos) + Math.max(...extremos)) / 2
            let diff = (mid + dx) - centroGrupoHijos
            if(diff !== 0){
                Object.values(cluster.cards).forEach( c => { if(c.fila >= 0) c.x += diff })
                Object.entries(cluster.filas).forEach( ([fila,intervalo]) => {
                    if(Number(fila) >= 0){
                        intervalo[0] += diff
                        intervalo[1] += diff
                    }
                })
            }
        } else if(hermanos){
            let dxHermanos = orientacion === "derecha"
                ? dxEmpujeDerecha(cluster, hermanos, 0, -Infinity, huecoXGrupo)
                : dxEmpujeIzquierda(cluster, hermanos, 0, Infinity, huecoXGrupo)
            fusionar(cluster, hermanos, dxHermanos, 0)

            // los padres tienen que quedar centrados sobre "id" + esos
            // hermanos, no solo sobre "id": se recoloca esa fila (y todo lo
            // que cuelgue de ella hacia abajo) para que quede centrada bajo
            // el centro real de los padres, sin arrastrar a la pareja de
            // "id" que ya estuviera ahí
            let hermanosLo = hermanos.filas[0][0] + dxHermanos
            let hermanosHi = hermanos.filas[0][1] + dxHermanos
            let centroGrupoHijos = (
                Math.min(centroId - anchoTarjeta / 2, hermanosLo) +
                Math.max(centroId + anchoTarjeta / 2, hermanosHi)
            ) / 2
            let diff = (mid + dx) - centroGrupoHijos
            if(diff !== 0){
                Object.values(cluster.cards).forEach( c => { if(c.fila >= 0) c.x += diff })
                Object.entries(cluster.filas).forEach( ([fila,intervalo]) => {
                    if(Number(fila) >= 0){
                        intervalo[0] += diff
                        intervalo[1] += diff
                    }
                })
            }
        }
    }

    // 4) HERMANOS a la izquierda del cluster completo (incluida la pareja)
    colgantes.filter( c => c.tipo === "hermano" ).forEach( h => {
        let sub = construirCluster(h.id, adyacencia, "izquierda")
        let dx = dxEmpujeIzquierda(cluster, sub, 0, Infinity, huecoXGrupo)
        fusionar(cluster, sub, dx, 0)
    })

    // centro de ESTA persona + su propia pareja real, en su posición FINAL
    // (tras los pasos 2, 3 y 4, que pueden haber desplazado la fila
    // entera): es lo que usan otros clusters para centrarse sobre "mí",
    // sin confundirme con hermanos ajenos que hayan aterrizado en mi misma
    // fila (ver el bloque de "hermanos" en el paso 3)
    cluster.centroPropio = idPareja
        ? (cluster.cards[id].x + cluster.cards[idPareja].x) / 2 + anchoTarjeta / 2
        : cluster.cards[id].x + anchoTarjeta / 2

    return cluster
}

export function calcularLayout(miembros){

    if(miembros.length === 0){
        return { posiciones : {}, lineas : [], anchoTotal : 0, altoTotal : 0 }
    }

    let porId = {}
    miembros.forEach( m => porId[m._id] = m )

    let raiz = miembros.find( m => m.idReferencia === null )
    if(!raiz){
        return { posiciones : {}, lineas : [], anchoTotal : 0, altoTotal : 0 }
    }

    // Adyacencia: construye el grafo de "quién cuelga de quién".
    // IMPORTANTE: los hermanos y descendientes que referencian a una PAREJA
    // se redirigen al primario del par (quien tiene el edge "pareja" en su
    // propia adyacencia), para que construirCluster los centre bajo la
    // pareja entera y no bajo uno solo de sus dos miembros. Si no, un hijo
    // creado desde la tarjeta de la pareja (en vez de la del primario)
    // quedaría descentrado respecto a la línea, que sí conoce la pareja.
    let adyacencia = {}
    miembros.forEach( m => {
        if(m.idReferencia === null) return
        let targetId = m.idReferencia
        if(m.relacionDirecta === "hermano" || m.relacionDirecta === "descendiente"){
            let ref = porId[m.idReferencia]
            if(ref && ref.relacionDirecta === "pareja" && ref.idReferencia !== null){
                targetId = ref.idReferencia
            }
        }
        if(!adyacencia[targetId]) adyacencia[targetId] = []
        adyacencia[targetId].push({ id : m._id, tipo : m.relacionDirecta, genero : m.genero })
    })

    let cluster = construirCluster(raiz._id, adyacencia, "izquierda", true)

    // normalizar a coordenadas positivas
    let minX    = Infinity,  maxX    = -Infinity
    let minFila = Infinity,  maxFila = -Infinity
    Object.entries(cluster.filas).forEach( ([fila,intervalo]) => {
        minFila = Math.min(minFila, Number(fila))
        maxFila = Math.max(maxFila, Number(fila))
        minX    = Math.min(minX, intervalo[0])
        maxX    = Math.max(maxX, intervalo[1])
    })

    let posiciones = {}
    Object.entries(cluster.cards).forEach( ([id,c]) => {
        posiciones[id] = {
            x : c.x - minX,
            y : (c.fila - minFila) * altoFila,
        }
    })

    // ── LÍNEAS ──────────────────────────────────────────────────────────
    // pequeño solape para que la línea "entre" en la tarjeta
    const solape = 3

    // mapa pareja: id <-> idPareja
    let parejaDe = {}
    miembros.forEach( m => {
        if(m.relacionDirecta === "pareja" && m.idReferencia !== null){
            parejaDe[m.idReferencia] = m._id
            parejaDe[m._id] = m.idReferencia
        }
    })

    // dos progenitores del MISMO hijo se tratan también como pareja a
    // efectos de tronco/línea, aunque no tengan un edge "pareja" explícito
    // entre ellos: si no, un hermano colgado de uno de los dos (en vez de
    // "Tú") dibuja su línea desde ese progenitor solo, en vez de desde la
    // misma unión de la que sale "Tú"
    let progenitoresPorHijo = {}
    miembros.forEach( m => {
        if(m.relacionDirecta !== "progenitor") return
        if(!progenitoresPorHijo[m.idReferencia]) progenitoresPorHijo[m.idReferencia] = []
        progenitoresPorHijo[m.idReferencia].push(m._id)
    })
    Object.values(progenitoresPorHijo).forEach( ids => {
        if(ids.length === 2 && !parejaDe[ids[0]] && !parejaDe[ids[1]]){
            parejaDe[ids[0]] = ids[1]
            parejaDe[ids[1]] = ids[0]
        }
    })

    // X del "tronco" de un par: punto medio entre el primario y su pareja,
    // o el centro del primario si no tiene pareja
    function centroTroncoDe(id){
        let p = posiciones[id]
        if(!p) return null
        let idPareja = parejaDe[id]
        if(idPareja && posiciones[idPareja]){
            let pPareja = posiciones[idPareja]
            return (Math.min(p.x, pPareja.x) + Math.max(p.x, pPareja.x)) / 2 + anchoTarjeta / 2
        }
        return p.x + anchoTarjeta / 2
    }

    // yInicio: por defecto arranca justo bajo la tarjeta (yArriba - solape);
    // cuando el origen es una pareja/par de progenitores unidos por una
    // línea horizontal a media altura, se le pasa esa altura para que el
    // tronco arranque pegado a esa línea y no deje un hueco visual
    function codoVertical(xArriba, yArriba, xAbajo, yAbajo, yInicio = yArriba - solape){
        let yMedio = yArriba + huecoY / 2
        return [
            [xArriba, yInicio],
            [xArriba, yMedio],
            [xAbajo,  yMedio],
            [xAbajo,  yAbajo + solape],
        ]
    }

    let lineas = []

    // 1) Líneas de PAREJA: trazo horizontal a media altura
    miembros.forEach( m => {
        if(m.relacionDirecta !== "pareja") return
        let pm = posiciones[m._id]
        let pr = posiciones[m.idReferencia]
        if(!pm || !pr) return
        let xIzq = Math.min(pr.x, pm.x) + anchoTarjeta - solape
        let xDer = Math.max(pr.x, pm.x) + solape
        let y    = pr.y + altoTarjeta / 2
        lineas.push({ puntos : [[xIzq, y], [xDer, y]] })
    })

    // 2) Líneas de PROGENITOR: agrupadas por el hijo al que pertenecen (como
    //    mucho padre + madre). Si son dos, se unen con una horizontal y el
    //    tronco baja desde el CENTRO de esa línea; si es uno solo, baja
    //    directamente desde su centro.
    let gruposProgenitor = {}
    miembros.forEach( m => {
        if(m.relacionDirecta !== "progenitor") return
        if(!gruposProgenitor[m.idReferencia]) gruposProgenitor[m.idReferencia] = []
        gruposProgenitor[m.idReferencia].push(m)
    })

    // si un progenitor tiene pareja, ella también cuenta como progenitor del
    // mismo hijo aunque no tenga su propio edge "progenitor" (p.ej. la
    // pareja de un abuelo ya registrado, añadida después): si no, el hijo
    // se dibuja colgado de un solo progenitor en vez de la unión completa
    Object.values(gruposProgenitor).forEach( lista => {
        lista.slice().forEach( p => {
            let idPareja = parejaDe[p._id]
            if(idPareja && !lista.some( x => x._id === idPareja )){
                let pareja = porId[idPareja]
                if(pareja) lista.push(pareja)
            }
        })
    })

    Object.entries(gruposProgenitor).forEach( ([idHijo,progenitores]) => {
        let pHijo = posiciones[idHijo]
        if(!pHijo) return

        let ps = progenitores
            .map( p => posiciones[p._id] )
            .filter( Boolean )
            .sort( (a,b) => a.x - b.x )

        if(ps.length === 0) return

        let yPadres = ps[0].y

        if(ps.length >= 2){
            let xIzq = ps[0].x + anchoTarjeta - solape
            let xDer = ps[ps.length - 1].x + solape
            let yLinea = yPadres + altoTarjeta / 2

            // si uno de los dos está aquí solo por ser pareja explícita del
            // otro (no por tener su propio edge "progenitor"), la barra de
            // unión ya la dibujó la sección 1: no hay que duplicarla
            let yaSonPareja = progenitores.some( p => p.relacionDirecta === "pareja" )
            if(!yaSonPareja){
                lineas.push({ puntos : [[xIzq, yLinea], [xDer, yLinea]] })
            }

            let xTronco = (ps[0].x + ps[ps.length - 1].x) / 2 + anchoTarjeta / 2
            lineas.push({ puntos : codoVertical(
                xTronco, yPadres + altoTarjeta,
                pHijo.x + anchoTarjeta / 2, pHijo.y,
                yLinea
            )})
        } else {
            lineas.push({ puntos : codoVertical(
                ps[0].x + anchoTarjeta / 2, yPadres + altoTarjeta,
                pHijo.x + anchoTarjeta / 2, pHijo.y,
                yPadres + altoTarjeta / 2
            )})
        }
    })

    // 3) Líneas de DESCENDIENTE: conector en T compartido por grupo
    //    Agrupa a los hijos por su "tronco" de origen (par o progenitor solo)
    let gruposTronco = {}  // clave -> { xTronco, yParent, hijos:[xCentro] }

    miembros.forEach( m => {
        if(m.relacionDirecta !== "descendiente") return
        let pm = posiciones[m._id]
        let pr = posiciones[m.idReferencia]
        if(!pm || !pr) return

        let xTronco = m.hijoDeAmbos === false
            ? pr.x + anchoTarjeta / 2
            : centroTroncoDe(m.idReferencia)

        // Clave del grupo: si hijoDeAmbos, usar la pareja (ordenada) como clave
        let clave
        if(m.hijoDeAmbos === false){
            clave = m.idReferencia + ":solo"
        } else {
            let idPareja = parejaDe[m.idReferencia]
            clave = idPareja
                ? [m.idReferencia, idPareja].sort().join("+")
                : m.idReferencia
        }

        if(!gruposTronco[clave]){
            gruposTronco[clave] = {
                xTronco,
                yParent : pr.y + altoTarjeta,
                // altura de la línea de unión de la pareja/progenitor: el
                // tronco tiene que arrancar pegado a ella, si no deja un
                // hueco visual entre esa línea y el tronco hacia los hijos
                yUnion  : pr.y + altoTarjeta / 2,
                hijos   : [],
            }
        }
        gruposTronco[clave].hijos.push(pm.x + anchoTarjeta / 2)
    })

    Object.values(gruposTronco).forEach( ({ xTronco, yParent, yUnion, hijos }) => {
        // yMid: línea horizontal que reparte a los hijos, a mitad de camino
        // entre la fila de los padres y la fila de los hijos
        let yMid   = yParent + huecoY / 2
        // yChild: la fila de los hijos siempre es exactamente altoFila por debajo
        let yChild = yParent + huecoY

        if(hijos.length === 1){
            // un solo hijo: codo directo (evita la barra horizontal innecesaria)
            lineas.push({ puntos : codoVertical(xTronco, yParent, hijos[0], yChild, yUnion) })
        } else {
            // 1. vertical: de la línea de unión (xTronco) hasta la barra horizontal
            lineas.push({ puntos : [[xTronco, yUnion], [xTronco, yMid]] })

            // 2. horizontal única y recta: del primer al último hijo. Incluye
            // también xTronco: si "id" llega a los mismos padres por su
            // propia línea (progenitor) y queda fuera del rango de sus
            // hermanos, el tronco tiene que alcanzar igualmente la barra
            // para no quedar desconectado de ella
            let xs = [xTronco, ...hijos]
            lineas.push({ puntos : [[Math.min(...xs), yMid], [Math.max(...xs), yMid]] })

            // 3. verticales cortas: de la barra hasta cada hijo
            hijos.forEach( xH => {
                lineas.push({ puntos : [[xH, yMid], [xH, yChild + solape]] })
            })
        }
    })

    // 4) Líneas de HERMANO: conector en ∩ POR ENCIMA de las dos tarjetas
    //    Si la referencia es una pareja, se dibuja hacia el primario del par
    //    para que el arco no cruce toda la pantalla.
    miembros.forEach( m => {
        if(m.relacionDirecta !== "hermano") return
        let pm = posiciones[m._id]
        if(!pm) return

        // Redirigir la referencia al primario del par si aplica
        let idRef = m.idReferencia
        let refM  = porId[idRef]
        if(refM && refM.relacionDirecta === "pareja" && refM.idReferencia !== null){
            idRef = refM.idReferencia
        }
        let pr = posiciones[idRef]
        if(!pr) return

        let xIzq    = Math.min(pm.x, pr.x) + anchoTarjeta / 2
        let xDer    = Math.max(pm.x, pr.x) + anchoTarjeta / 2
        let yArriba = Math.min(pm.y, pr.y)
        let yMedio  = yArriba - huecoY / 4

        lineas.push({ puntos : [
            [xIzq, yArriba + solape],
            [xIzq, yMedio],
            [xDer, yMedio],
            [xDer, yArriba + solape],
        ]})
    })

    return {
        posiciones,
        lineas,
        anchoTotal : maxX - minX,
        altoTotal  : (maxFila - minFila) * altoFila + altoTarjeta,
    }
}

export const anchoTarjetaPx = anchoTarjeta
export const altoTarjetaPx  = altoTarjeta
export const altoFilaPx     = altoFila
export const huecoXPx       = huecoX
export const huecoYPx       = huecoY
