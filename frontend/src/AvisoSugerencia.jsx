import { Link } from "react-router-dom"

// Aviso que aparece en el formulario de edición cuando el usuario no puede
// editar directamente (no es el creador/dueño): explica quién sí puede,
// con enlace a su perfil si tiene uno accesible en esta familia.
function AvisoSugerencia({ prefijo, creador }){
    return  <div className="bg-accent2/10 border border-accent2/30 rounded-lg p-3 text-sm text-secondary flex flex-col gap-1">
                <p>
                    {prefijo} ha sido creado por{" "}
                    {
                        creador && creador.idMiembro
                        ? <Link to={`/miembros/${creador.idMiembro}`} className="text-accent hover:underline font-medium">{creador.nombreReal}</Link>
                        : <span className="font-medium">{creador ? creador.nombreReal : "otra persona"}</span>
                    }
                    .
                </p>
                <p className="text-grey">No puedes editar la información directamente, pero puedes enviar una sugerencia de cambios al creador.</p>
            </div>
}

export default AvisoSugerencia
