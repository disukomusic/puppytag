import { useEffect, useState } from "react"

export default function OptionsPage() {
    // State is now "enable" and defaults to false (OFF)
    const [enablePredictive, setEnablePredictive] = useState(false)

    useEffect(() => {
        chrome.storage.local.get(["enablePredictiveTagging"], (res) => {
            if (res.enablePredictiveTagging !== undefined) {
                setEnablePredictive(res.enablePredictiveTagging)
            } else {
                // Save the default "false" state if it doesn't exist yet
                chrome.storage.local.set({ enablePredictiveTagging: false })
            }
        })
    }, [])

    const toggleSetting = () => {
        const newValue = !enablePredictive
        setEnablePredictive(newValue)
        chrome.storage.local.set({ enablePredictiveTagging: newValue })
    }

    return (
        <div style={{ padding: "24px", fontFamily: "sans-serif", background: "#151d28", color: "#fff", minHeight: "100vh" }}>
            <h1 style={{ color: "#0f73ff", fontSize: "20px", marginTop: 0 }}>Puppytag Settings</h1>

            <div style={{ marginTop: "24px", background: "#222e3f", padding: "16px", borderRadius: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", fontSize: "14px" }}>
                    <input
                        type="checkbox"
                        checked={enablePredictive}
                        onChange={toggleSetting}
                        style={{ width: "16px", height: "16px", cursor: "pointer" }}
                    />
                    Enable predictive tag suggestions
                </label>
            </div>
        </div>
    )
}