import { useState } from "react"
import { MultiTagSearch } from "./MultiTagSearch"
import icon from "../assets/icon.png"

export function MultiTagSidebar() {
    const [isOpen, setIsOpen] = useState(false)
    const [dimensions, setDimensions] = useState({ width: 320, height: 480 })

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed', bottom: '24px', right: '24px', zIndex: 2147483647,
                    background: 'rgba(0,133,255,0)', color: '#fff', border: 'none', borderRadius: '50px',
                    padding: '12px 20px', fontSize: '24px', fontWeight: 'bold', cursor: 'pointer',
                }}
            >
                <img
                    src={icon}
                    alt="Open multi-tag"
                    title="Open multi-tag"
                    style={{ width: 36, height: 36, display: 'block' }}
                />
            </button>
        )
    }

    return (
        <MultiTagSearch
            mode="sidebar"
            onClose={() => setIsOpen(false)}
            dimensions={dimensions}
            onDimensionsChange={setDimensions}
        />
    )
}