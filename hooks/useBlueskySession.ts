import { useState, useEffect } from "react"

export function useBlueskySession() {
    const [currentUserDid, setCurrentUserDid] = useState<string | null>(null)
    const [currentUserHandle, setCurrentUserHandle] = useState<string | null>(null)
    const [currentUserJwt, setCurrentUserJwt] = useState<string | null>(null)

    useEffect(() => {
        try {
            const sessionStr = localStorage.getItem("BSKY_STORAGE")
            if (sessionStr) {
                const session = JSON.parse(sessionStr)
                const account = session?.session?.currentAccount

                if (account?.did) setCurrentUserDid(account.did)
                if (account?.handle) setCurrentUserHandle(account.handle)
                if (account?.accessJwt) setCurrentUserJwt(account.accessJwt)
            }
        } catch (e) {
            console.error("Could not parse Bluesky session", e)
        }
    }, [])

    return { currentUserDid, currentUserHandle, currentUserJwt }
}