import { useEffect, useState } from "react"

export function MultiTagSidebar() {
    const [isOpen, setIsOpen] = useState(false)
    const [inputValue, setInputValue] = useState("")
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [postDetails, setPostDetails] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [dimensions, setDimensions] = useState({ width: 320, height: 480 })

    // Handle Autocomplete Search
    useEffect(() => {
        if (!inputValue) {
            setSuggestions([])
            return
        }

        const delay = setTimeout(() => {
            chrome.runtime.sendMessage(
                { action: "search_tags", payload: { query: inputValue.toLowerCase().trim() } },
                (response) => {
                    if (response && response.data) setSuggestions(response.data)
                }
            )
        }, 200)

        return () => clearTimeout(delay)
    }, [inputValue])

    // Fetch Matching Posts & Details
    useEffect(() => {
        if (selectedTags.length === 0) {
            setPostDetails([])
            return
        }

        setIsLoading(true)
        chrome.runtime.sendMessage(
            { action: "get_posts_by_multi_tags", payload: { tags: selectedTags } },
            async (response) => {
                if (response && response.data && response.data.length > 0) {
                    try {
                        const chunks = [];
                        for (let i = 0; i < response.data.length; i += 25) {
                            chunks.push(response.data.slice(i, i + 25));
                        }

                        let allPosts = [];
                        for (const chunk of chunks) {
                            const params = new URLSearchParams();
                            chunk.forEach((p: any) => params.append('uris', `at://${p.did}/app.bsky.feed.post/${p.rkey}`));
                            const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?${params.toString()}`);
                            const data = await res.json();
                            if (data.posts) {
                                allPosts = [...allPosts, ...data.posts];
                            }
                        }
                        setPostDetails(allPosts);
                    } catch (e) {
                        console.error("Failed to fetch post details from Bluesky API", e);
                        setPostDetails([]);
                    }
                } else {
                    setPostDetails([]);
                }
                setIsLoading(false)
            }
        )
    }, [selectedTags])

    const addTag = (tag: string) => {
        const cleanTag = tag.toLowerCase().trim()
        if (cleanTag && !selectedTags.includes(cleanTag)) {
            setSelectedTags([...selectedTags, cleanTag])
        }
        setInputValue("")
        setSuggestions([])
    }

    const removeTag = (tagToRemove: string) => {
        setSelectedTags(selectedTags.filter(t => t !== tagToRemove))
    }

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
                🐾
            </button>
        )
    }

    return (
        <div style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 2147483647,
            background: '#0f172a', border: '1px solid #334155', borderRadius: '16px',
            width: `${dimensions.width}px`, height: `${dimensions.height}px`,
            minWidth: '250px', minHeight: '350px',
            maxWidth: '90vw', maxHeight: '90vh',
            overflow: 'hidden',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)', display: 'flex',
            flexDirection: 'column', fontFamily: 'sans-serif'
        }}>

            <div
                onMouseDown={(e) => {
                    e.preventDefault();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startWidth = dimensions.width;
                    const startHeight = dimensions.height;

                    const onMouseMove = (moveEvent: MouseEvent) => {
                        const deltaX = startX - moveEvent.clientX;
                        const deltaY = startY - moveEvent.clientY;

                        setDimensions({
                            width: Math.max(250, startWidth + deltaX),
                            height: Math.max(350, startHeight + deltaY)
                        });
                    };

                    const onMouseUp = () => {
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                    };

                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                }}
                style={{
                    position: 'absolute', top: 0, left: 0, width: '24px', height: '24px',
                    cursor: 'nwse-resize', zIndex: 10, display: 'flex',
                }}
            >
                <svg width="12" height="12" viewBox="0 0 12 12" style={{ margin: '4px 0 0 4px' }}>
                    <path d="M0,0 L12,0 L0,12 Z" fill="#64748b" />
                </svg>
            </div>

            <div style={{ background: '#1e293b', padding: '12px 16px 12px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' }}>
                <h3 style={{ margin: 0, color: '#38bdf8', fontSize: '15px' }}>Puppytag Multisearch</h3>
                <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                    {selectedTags.map(tag => (
                        <span key={tag} style={{ background: "#1e293b", padding: "4px 8px", borderRadius: "12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", color: '#fff' }}>
                            #{tag}
                            <button onClick={() => removeTag(tag)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", padding: 0 }}>✕</button>
                        </span>
                    ))}
                </div>

                <div style={{ position: "relative", marginBottom: "16px" }}>
                    <input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Search tags..."
                        onKeyDown={(e) => { if (e.key === 'Enter') addTag(inputValue) }}
                        style={{ width: "100%", boxSizing: "border-box", background: "#161e27", color: "#fff", border: "1px solid #334155", borderRadius: "8px", padding: "8px", outline: "none" }}
                    />

                    {suggestions.length > 0 && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", marginTop: "4px", zIndex: 10, overflow: "hidden" }}>
                            {suggestions.filter(s => !selectedTags.includes(s)).map(s => (
                                <div
                                    key={s}
                                    onClick={() => addTag(s)}
                                    style={{ padding: "8px", cursor: "pointer", fontSize: "13px", color: '#fff', borderBottom: "1px solid #0f172a" }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    #{s}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <h4 style={{ fontSize: "13px", color: '#94a3b8', margin: '0 0 8px 0' }}>
                        {isLoading ? "Loading..." : `Found ${postDetails.length} matching posts`}
                    </h4>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", paddingRight: '4px', flex: 1 }}>
                        {postDetails.map(post => {
                            const rkey = post.uri.split('/').pop();
                            const thumb = post.embed?.images?.[0]?.thumb || post.embed?.media?.images?.[0]?.thumb;

                            return (
                                <a
                                    key={post.uri}
                                    href={`https://bsky.app/profile/${post.author.handle}/post/${rkey}`}
                                    style={{ display: "flex", gap: "10px", background: "#1e293b", padding: "10px", borderRadius: "8px", color: "#e2e8f0", textDecoration: "none" }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#1e293b'}
                                >
                                    {thumb && <img src={thumb} style={{ width: "48px", height: "48px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }} alt="thumbnail" />}
                                    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                        <span style={{ fontSize: "13px", fontWeight: "bold", color: "#38bdf8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            @{post.author.handle}
                                        </span>
                                        <span style={{ fontSize: "12px", color: "#94a3b8", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: "2px" }}>
                                            {post.record.text}
                                        </span>
                                    </div>
                                </a>
                            )
                        })}
                        {selectedTags.length > 0 && postDetails.length === 0 && !isLoading && (
                            <div style={{ color: "#94a3b8", fontSize: "12px" }}>No posts match all selected tags.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}