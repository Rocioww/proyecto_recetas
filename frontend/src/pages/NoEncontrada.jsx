import { Link } from "react-router-dom"

function NoEncontrada(){
    return  <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
                <p className="text-6xl">🍽️</p>
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-display font-semibold">Página no encontrada</h1>
                    <p className="text-base text-grey max-w-md">Vaya, se te olvidó sacar el pollo de la nevera para descongelarlo, hoy no podremos cocinarlo.</p>
                </div>
                <Link to="/" className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 hover:opacity-90">
                    Volver al inicio
                </Link>
            </div>
}

export default NoEncontrada
