import type { PlasmoCSConfig } from "plasmo"
import { useEffect } from "react"
import { createRoot } from "react-dom/client"
import { PostTagUI } from "./components/PostTagUI"
import { MultiTagSidebar } from "./components/MultiTagSidebar"

export const config: PlasmoCSConfig = {
    matches: ["https://bsky.app/*"]
}

export default function TaggerEngine() {
    useEffect(() => {
        if (!document.getElementById("plasmo-multi-tag-root")) {
            const sidebarWrapper = document.createElement("div")
            sidebarWrapper.id = "plasmo-multi-tag-root"
            document.body.appendChild(sidebarWrapper)

            const sidebarRoot = createRoot(sidebarWrapper)
            sidebarRoot.render(<MultiTagSidebar />)
        }

        const observer = new MutationObserver(() => {
            const links = document.querySelectorAll('a[href*="/post/"]')

            links.forEach(link => {
                const href = link.getAttribute('href') || ""
                const urlMatch = href.match(/profile\/([^\/]+)\/post\/([a-zA-Z0-9_-]+)/)

                if (!urlMatch) return

                const container = link.closest('div[data-testid^="feedItem"], div[data-testid^="postThreadItem"]') as HTMLElement

                if (container && !container.querySelector('.bsky-tagger-ui')) {

                    const postTextElement = container.querySelector('div[data-testid="postText"]');
                    const textContent = postTextElement ? postTextElement.textContent : "";
                    const hashtagMatches = textContent?.match(/#([a-zA-Z0-9_]+)/g);

                    const suggestedTags = hashtagMatches
                        ? Array.from(new Set(hashtagMatches.map(t => t.slice(1).toLowerCase())))
                        : [];

                    const wrapper = document.createElement("div")
                    wrapper.className = "bsky-tagger-ui"
                    wrapper.style.width = "100%"
                    container.appendChild(wrapper)

                    const root = createRoot(wrapper)
                    root.render(
                        <PostTagUI
                            url={`https://bsky.app${href}`}
                            handle={urlMatch[1]}
                            rkey={urlMatch[2]}
                            suggestedTags={suggestedTags}
                        />
                    )
                }
            })
        })

        observer.observe(document.body, { childList: true, subtree: true })

        return () => observer.disconnect()
    }, [])

    return null
}