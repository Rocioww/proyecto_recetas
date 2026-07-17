import Modal from "./Modal"

// Modal de confirmación para acciones destructivas (borrar algo).
// Sustituye a window.confirm() con la estética de la web.
function ModalConfirmar({ titulo, mensaje, textoConfirmar = "Borrar", onConfirmar, onCerrar }){
    return  <Modal onCerrar={onCerrar}>
                <h2 className="font-display text-[1.425rem] font-semibold">{titulo}</h2>
                <p className="text-sm text-grey">{mensaje}</p>
                <div className="flex gap-2 justify-end pt-2">
                    <button onClick={onCerrar} className="text-sm text-grey hover:text-secondary px-4 py-2">
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirmar}
                        className="bg-red-500 text-white uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:bg-red-600"
                    >
                        {textoConfirmar}
                    </button>
                </div>
            </Modal>
}

export default ModalConfirmar
