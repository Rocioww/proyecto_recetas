// ==========================================================
//  Cálculo de parentescos por generaciones (no por tabla fija)
// ==========================================================
//
// Cada miembro se guarda con dos números:
//
//   arriba -> generaciones desde "yo" hasta el antepasado común con esa persona
//   abajo  -> generaciones desde ese antepasado común hasta la persona
//
// Con esos dos números se puede calcular CUALQUIER parentesco de sangre,
// por lejano que sea, sin tabla fija.
//
// El género admite tres valores: "M", "F" y "X" (neutro). Para el neutro
// se usa la convención de lenguaje inclusivo de terminar en "-x"
// (hermanx, tíx, primx... y "hijx"/"progenitorx" para los casos
// irregulares donde padre/madre e hijo/hija no comparten raíz).
//
// "pareja" es la única relación que NO es de sangre (es política) y se
// resuelve aparte, a partir de la posición de la persona con la que se
// casa/empareja.

const ascendentes = {
    1: ["padre", "madre", "progenitorx"],
    2: ["abuelo", "abuela", "abuelx"],
    3: ["bisabuelo", "bisabuela", "bisabuelx"],
    4: ["tatarabuelo", "tatarabuela", "tatarabuelx"],
};

const descendentes = {
    1: ["hijo", "hija", "hijx"],
    2: ["nieto", "nieta", "nietx"],
    3: ["bisnieto", "bisnieta", "bisnietx"],
    4: ["tataranieto", "tataranieta", "tataranietx"],
};

// grado de primazgo -> palabra ("primo" ya cubre el grado 1)
const ordinalesPrimo = ["", "", "segundo", "tercero", "cuarto", "quinto", "sexto", "séptimo"];

// M -> 0, F -> 1, X (neutro) -> 2. Por defecto masculino si el dato viene mal.
function idxGenero(genero) {
    if (genero === "F") return 1;
    if (genero === "X") return 2;
    return 0;
}

// pequeño helper para elegir entre las 3 formas de una palabra suelta
function formaGenero(masculino, femenino, neutro, genero) {
    return [masculino, femenino, neutro][idxGenero(genero)];
}

export function nombreDirectoAscendente(n, genero) {
    const i = idxGenero(genero);
    if (n <= 0) return "yo";
    if (ascendentes[n]) return ascendentes[n][i];
    // más allá de tatarabuelo: "tatara-tatara-...-abuelo/a/e"
    return "tatara-".repeat(n - 4) + ascendentes[4][i];
}

export function nombreDirectoDescendente(n, genero) {
    const i = idxGenero(genero);
    if (n <= 0) return "yo";
    if (descendentes[n]) return descendentes[n][i];
    return "tatara-".repeat(n - 4) + descendentes[4][i];
}

/**
 * A partir de (arriba, abajo) calcula el nombre del parentesco DE SANGRE.
 * Nunca devuelve "familiar": para cualquier combinación hay una regla.
 */
export function calcularParentescoConsanguineo(arriba, abajo, genero) {
    if (arriba === 0 && abajo === 0) return "yo";

    if (abajo === 0) return nombreDirectoAscendente(arriba, genero);
    if (arriba === 0) return nombreDirectoDescendente(abajo, genero);

    if (arriba === 1 && abajo === 1) return formaGenero("hermano", "hermana", "hermanx", genero);

    // tío / tío abuelo / tío bisabuelo / tío tatarabuelo...
    if (abajo === 1 && arriba > 1) {
        const base = formaGenero("tío", "tía", "tíx", genero);
        if (arriba === 2) return base;
        return `${base} ${nombreDirectoAscendente(arriba - 1, genero)}`;
    }

    // sobrino / sobrino nieto / sobrino bisnieto...
    if (arriba === 1 && abajo > 1) {
        const base = formaGenero("sobrino", "sobrina", "sobrinx", genero);
        if (abajo === 2) return base;
        return `${base} ${nombreDirectoDescendente(abajo - 1, genero)}`;
    }

    // primos, del grado que sea, con o sin generaciones de diferencia
    const grado = Math.min(arriba, abajo) - 1; // 1 = primo hermano, 2 = primo segundo...
    const base = formaGenero("primo", "prima", "primx", genero);
    const nombrePrimo = grado <= 1 ? base : `${base} ${ordinalesPrimo[grado] || `de grado ${grado}`}`;
    const diferencia = Math.abs(arriba - abajo);

    return diferencia === 0
        ? nombrePrimo
        : `${nombrePrimo} (${diferencia} generación${diferencia > 1 ? "es" : ""} de diferencia)`;
}

// pareja de un pariente de sangre: por decisión de producto ya no se
// distinguen los términos políticos (padrastro/madrastra, yerno/nuera,
// cuñado/cuñada, tío político...) - toda pareja de un familiar se nombra
// directamente con el término de sangre equivalente en esa misma posición
// (la pareja de tu madre es "padre" o "madre", la de tu hijo es "hijo/a",
// etc.), como si fuera un familiar más. La única excepción es la propia
// pareja de "yo" (arriba=0, abajo=0), que no tiene equivalente de sangre.
export function nombrePolitico(referencia, generoDeLaPareja) {
    const { arriba, abajo } = referencia;
    if (arriba === 0 && abajo === 0) return "pareja";
    return calcularParentescoConsanguineo(arriba, abajo, generoDeLaPareja);
}

// --- composición: a partir de la posición (arriba,abajo) de una persona
//     de referencia, calcula la posición de su progenitor, descendiente
//     o hermano ---

export function posicionPadre(ref) {
    // si ref todavía no está en el tronco directo de "yo" (abajo > 0),
    // su progenitor está un paso más cerca del antepasado común
    if (ref.abajo > 0) return { arriba: ref.arriba, abajo: ref.abajo - 1 };
    // si ref YA es el antepasado común (abajo === 0), su progenitor extiende
    // el tronco un escalón más arriba
    return { arriba: ref.arriba + 1, abajo: 0 };
}

export function posicionHijo(ref) {
    return { arriba: ref.arriba, abajo: ref.abajo + 1 };
}

export function posicionHermano(ref) {
    return posicionHijo(posicionPadre(ref));
}

/**
 * Función principal: dada la relación directa elegida por el usuario
 * ("progenitor", "descendiente", "hermano", "pareja") y la persona de
 * referencia ({arriba, abajo, parentesco, ...}) calcula la posición
 * completa del nuevo miembro. El género ("M"/"F"/"X") solo afecta a
 * cómo se NOMBRA el parentesco, nunca a cómo se calcula.
 *
 * Para el primer miembro de una familia (no hay referencia) se llama
 * como calcularPosicion("yo", null, genero).
 */
export function calcularPosicion(relacionDirecta, referencia, genero) {

    if (relacionDirecta === "yo") {
        return { arriba: 0, abajo: 0, esPolitico: false, parentesco: "yo" };
    }

    if (relacionDirecta === "pareja") {
        const { arriba, abajo } = referencia;
        return {
            arriba,
            abajo,
            esPolitico: true,
            parentesco: nombrePolitico(referencia, genero),
        };
    }

    let pos;
    if (relacionDirecta === "progenitor") {
        pos = posicionPadre(referencia);
    } else if (relacionDirecta === "descendiente") {
        pos = posicionHijo(referencia);
    } else if (relacionDirecta === "hermano") {
        pos = posicionHermano(referencia);
    } else {
        return null; // relación directa no reconocida
    }

    return {
        ...pos,
        esPolitico: false,
        parentesco: calcularParentescoConsanguineo(pos.arriba, pos.abajo, genero),
    };
}

// ==========================================================
//  Parentesco relativo entre DOS miembros cualesquiera
// ==========================================================
//
// arriba/abajo/parentesco se guardan en cada miembro relativos a la
// raíz original del árbol (quien creó la familia). Pero cada usuario
// vinculado a un miembro necesita ver los parentescos relativos a SU
// PROPIA posición, no a la de la raíz. Para eso se recorre el árbol
// real (idReferencia/relacionDirecta forman un grafo sin ciclos) entre
// el miembro del usuario y el miembro objetivo, y se recompone
// arriba/abajo desde cero con los mismos pasos que ya usa calcularPosicion.

// grafo no dirigido: para cada arista miembro<->idReferencia, qué pasos
// ("arriba"/"abajo"/"pareja") hay que dar para recorrerla en cada sentido
function construirGrafoParentesco(miembros) {
    const grafo = new Map();
    const vecinosDe = (id) => {
        if (!grafo.has(id)) grafo.set(id, []);
        return grafo.get(id);
    };

    miembros.forEach(m => {
        if (!m.idReferencia) return; // la raíz no tiene arista hacia arriba
        const id = m._id.toString();
        // normalizado a string: en registros antiguos idReferencia puede
        // venir como ObjectId en vez de string, y comparar tipos distintos
        // como claves del grafo rompería la conexión silenciosamente
        const ref = m.idReferencia.toString();

        if (m.relacionDirecta === "progenitor") {
            // m es progenitor de ref: de m a ref se baja, de ref a m se sube
            vecinosDe(id).push({ vecino: ref, pasos: ["abajo"] });
            vecinosDe(ref).push({ vecino: id, pasos: ["arriba"] });
        } else if (m.relacionDirecta === "descendiente") {
            vecinosDe(id).push({ vecino: ref, pasos: ["arriba"] });
            vecinosDe(ref).push({ vecino: id, pasos: ["abajo"] });
        } else if (m.relacionDirecta === "hermano") {
            vecinosDe(id).push({ vecino: ref, pasos: ["arriba", "abajo"] });
            vecinosDe(ref).push({ vecino: id, pasos: ["arriba", "abajo"] });
        } else if (m.relacionDirecta === "pareja") {
            vecinosDe(id).push({ vecino: ref, pasos: ["pareja"] });
            vecinosDe(ref).push({ vecino: id, pasos: ["pareja"] });
        }
    });

    // dos progenitores del mismo hijo cuentan como pareja aunque no tengan
    // un edge "pareja" explícito entre ellos (igual que en layoutArbol.js /
    // coProgenitorDeMiembro en el frontend): sin esto, el camino más corto
    // entre ellos pasa por el hijo ("abajo" + "arriba"), que da la MISMA
    // posición que el origen y se nombra "yo" en vez de "pareja" -y a su
    // vez, cualquiera calculado a través de ese co-progenitor sale con un
    // parentesco de sangre en vez de político (p.ej. el padre de tu pareja
    // saldría como "padre" en vez de "suegro")
    const progenitoresPorHijo = new Map();
    miembros.forEach(m => {
        if (m.relacionDirecta !== "progenitor" || !m.idReferencia) return;
        const hijo = m.idReferencia.toString();
        if (!progenitoresPorHijo.has(hijo)) progenitoresPorHijo.set(hijo, []);
        progenitoresPorHijo.get(hijo).push(m._id.toString());
    });
    progenitoresPorHijo.forEach(progenitores => {
        if (progenitores.length < 2) return;
        const [idA, idB] = progenitores; // como mucho 2 progenitores por hijo
        vecinosDe(idA).push({ vecino: idB, pasos: ["pareja"] });
        vecinosDe(idB).push({ vecino: idA, pasos: ["pareja"] });
    });

    return grafo;
}

// BFS: como el grafo de miembros es un árbol (cada miembro añade una
// única arista hacia una referencia ya existente), hay como mucho un
// camino entre dos miembros cualesquiera
function caminoEntreMiembros(grafo, idOrigen, idDestino) {
    if (idOrigen === idDestino) return [];
    const visitados = new Set([idOrigen]);
    const cola = [{ id: idOrigen, pasos: [] }];

    while (cola.length) {
        const { id, pasos } = cola.shift();
        for (const { vecino, pasos: pasosArista } of (grafo.get(id) || [])) {
            if (visitados.has(vecino)) continue;
            const nuevosPasos = [...pasos, ...pasosArista];
            if (vecino === idDestino) return nuevosPasos;
            visitados.add(vecino);
            cola.push({ id: vecino, pasos: nuevosPasos });
        }
    }
    return null; // no debería pasar: mismo árbol de la misma familia
}

/**
 * Calcula cómo se llama "destino" visto desde "origen" (dos miembros
 * cualesquiera del mismo árbol), en vez del parentesco fijo guardado en
 * BD (que siempre es relativo a la raíz original). Si no se puede
 * resolver (miembros de árboles distintos, o sin conexión) cae de vuelta
 * al parentesco guardado de "destino".
 */
export function calcularParentescoEntre(origen, destino, miembros) {
    if (!destino) return null;
    if (!origen) return destino.parentesco;

    const idOrigen = origen._id.toString();
    const idDestino = destino._id.toString();
    if (idOrigen === idDestino) return "yo";

    const grafo = construirGrafoParentesco(miembros);
    const pasos = caminoEntreMiembros(grafo, idOrigen, idDestino);
    if (!pasos) {
        // no debería pasar dentro de la misma familia: si ocurre, es que
        // el grafo idReferencia/relacionDirecta tiene algún miembro
        // desconectado (dato corrupto o de un formato antiguo)
        console.warn(`[parentesco] sin camino entre ${idOrigen} y ${idDestino}; usando parentesco guardado de la raíz como fallback`);
        return destino.parentesco;
    }

    let pos = { arriba: 0, abajo: 0 };
    for (const paso of pasos) {
        if (paso === "arriba") pos = posicionPadre(pos);
        else if (paso === "abajo") pos = posicionHijo(pos);
        // "pareja" no mueve la posición: la pareja de alguien comparte su sitio
    }

    // pareja DIRECTA (un único salto): el destino es, sencillamente, la
    // pareja de origen -sea porque hay un edge "pareja" explícito, o
    // porque son co-progenitores del mismo hijo sin edge explícito-
    if (pasos.length === 1 && pasos[0] === "pareja") {
        return nombrePolitico(pos, destino.genero);
    }

    // posición (0,0) pero NO es la misma persona (ya se descartó arriba) ni
    // la pareja directa (ya descartado justo encima): solo se llega aquí
    // cruzando MÁS DE UN enlace de pareja/co-progenitor en el camino (p.ej.
    // origen -> su hijo/a -> pareja del hijo/a -> padre de esa pareja: el
    // término real sería "consuegro/a", pero es una relación política sin
    // equivalente de sangre -viene de una familia distinta por completo-,
    // así que, siguiendo el mismo criterio de no usar términos políticos,
    // se nombra igual que la pareja directa en esa misma posición
    if (pos.arriba === 0 && pos.abajo === 0) {
        return nombrePolitico(pos, destino.genero);
    }

    // resto de casos político-al-final (p.ej. "tío político", o la pareja
    // de un abuelo/bisabuelo que se nombra igual que si fuera de sangre).
    // Si la pareja aparece en mitad del camino (y no cae en (0,0) de
    // arriba), se ignora el matiz político y se nombra por consanguinidad:
    // aproximación razonable para parentescos compuestos que ni el propio
    // árbol sabe nombrar con una sola palabra
    if (pasos[pasos.length - 1] === "pareja") {
        return nombrePolitico(pos, destino.genero);
    }

    return calcularParentescoConsanguineo(pos.arriba, pos.abajo, destino.genero);
}
