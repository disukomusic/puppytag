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
            // 1. Query  containers directly
            const containers = document.querySelectorAll('div[data-testid^="feedItem"], div[data-testid^="postThreadItem"]')

            containers.forEach((container: HTMLElement) => {
                // Skip if we already injected our UI here
                if (container.querySelector('.bsky-tagger-ui')) return

                let handle = ""
                let rkey = ""

                // STRATEGY A: Look for the timestamp link (Works for the Feed & Replies)
                const postLink = container.querySelector('a[href*="/post/"]')
                if (postLink) {
                    const href = postLink.getAttribute('href') || ""
                    const urlMatch = href.match(/profile\/([^\/]+)\/post\/([a-zA-Z0-9_-]+)/)
                    if (urlMatch) {
                        handle = urlMatch[1]
                        rkey = urlMatch[2]
                    }
                }

                // STRATEGY B: Fallback for the focused Thread View 
                // If there's no link, but we are on a post page, it's the root post.
                if (!rkey || !handle) {
                    const pathMatch = window.location.pathname.match(/\/profile\/([^\/]+)\/post\/([a-zA-Z0-9_-]+)/)
                    if (pathMatch) {
                        handle = pathMatch[1]
                        rkey = pathMatch[2]
                    }
                }

                // If both strategies fail, abort injection for this container
                if (!rkey || !handle) return

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
                        url={`https://bsky.app/profile/${handle}/post/${rkey}`}
                        handle={handle}
                        rkey={rkey}
                        suggestedTags={suggestedTags}
                    />
                )
            })
        })

        observer.observe(document.body, { childList: true, subtree: true })

        return () => observer.disconnect()
    }, [])

    return null
}