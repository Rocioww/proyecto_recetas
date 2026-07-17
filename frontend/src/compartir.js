// comparte una URL: usa el share nativo del sistema si está disponible
// (móvil sobre todo), y si no, copia el enlace al portapapeles como
// alternativa. Devuelve "compartido", "copiado" o "cancelado".
export async function compartirEnlace({ titulo, texto, url }){
    if(navigator.share){
        try{
            await navigator.share({ title : titulo, text : texto, url })
            return "compartido"
        }catch(error){
            if(error && error.name === "AbortError") return "cancelado"
            // si el share nativo falla por otro motivo, se intenta copiar
        }
    }
    await navigator.clipboard.writeText(url)
    return "copiado"
}
