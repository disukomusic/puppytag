import { useEffect, useState, ReactNode } from "react"

interface MultiTagSearchProps {
    mode: "popup" | "sidebar"
    onClose?: () => void
    dimensions?: { width: number; height: number }
    onDimensionsChange?: (dimensions: { width: number; height: number }) => void
}

export function MultiTagSearch({
    mode,
    onClose,
    dimensions,
    onDimensionsChange,
}: MultiTagSearchProps) {
    const [inputValue, setInputValue] = useState("")
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [postDetails, setPostDetails] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)

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

    // Fetch Matching Posts and their rich details
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

    const renderTagsList = (): ReactNode => (
        <>
            {/* Selected Tags */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                {selectedTags.map(tag => (
                    <span key={tag} style={{ background: "#222e3f", padding: "4px 8px", borderRadius: "12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", color: '#fff' }}>
                        #{tag}
                        <button onClick={() => removeTag(tag)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", padding: 0 }}>✕</button>
                    </span>
                ))}
            </div>

            {/* Input Field */}
            <div style={{ position: "relative", marginBottom: "16px" }}>
                <input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={mode === "popup" ? "Search for tags to filter by..." : "Search tags..."}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') addTag(inputValue)
                    }}
                    style={{ width: "100%", boxSizing: "border-box", background: "#151d28", color: "#fff", border: "1px solid #222e3f", borderRadius: "8px", padding: "8px", outline: "none" }}
                />

                {/* Autocomplete Dropdown */}
                {suggestions.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#222e3f", border: "1px solid #222e3f", borderRadius: "8px", marginTop: "4px", zIndex: 10, overflow: "hidden" }}>
                        {suggestions.filter(s => !selectedTags.includes(s)).map(s => (
                            <div
                                key={s}
                                onClick={() => addTag(s)}
                                style={{ padding: "8px", cursor: "pointer", fontSize: "13px", color: '#fff', borderBottom: "1px solid #151d28" }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#2e3d4f'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                #{s}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    )

    const renderPostsList = (): ReactNode => (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h3 style={mode === "popup" ? { fontSize: "14px", borderBottom: "1px solid #222e3f", paddingBottom: "8px" } : { fontSize: "13px", color: '#94a3b8', margin: '0 0 8px 0' }}>
                {isLoading ? "Loading..." : mode === "popup" ? `Found ${postDetails.length} posts` : `Found ${postDetails.length} matching posts`}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: mode === "popup" ? "12px" : "0", overflowY: "auto", paddingRight: mode === "sidebar" ? '4px' : '0', flex: 1 }}>
                {postDetails.map(post => {
                    const rkey = post.uri.split('/').pop();
                    const thumb = post.embed?.images?.[0]?.thumb || post.embed?.media?.images?.[0]?.thumb;

                    return (
                        <a
                            key={post.uri}
                            href={`https://bsky.app/profile/${post.author.handle}/post/${rkey}`}
                            target={mode === "popup" ? "_blank" : undefined}
                            rel={mode === "popup" ? "noreferrer" : undefined}
                            style={{ display: "flex", gap: "10px", background: "#222e3f", padding: "10px", borderRadius: "8px", color: "#e2e8f0", textDecoration: "none" }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#2e3d4f'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#222e3f'}
                        >
                            {thumb && <img src={thumb} style={{ width: "48px", height: "48px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }} alt="thumbnail" />}
                            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                <span style={{ fontSize: "13px", fontWeight: "bold", color: "#0f73ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
    )

    if (mode === "popup") {
        return (
            <div style={{ padding: 16, width: 350, fontFamily: "sans-serif", background: "#151d28", color: "#fff", minHeight: 400, display: "flex", flexDirection: "column", maxHeight: "600px" }}>
                <h2 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#0f73ff" }}>Puppytag Multisearch</h2>
                {renderTagsList()}
                {/* Results */}
                <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                    {renderPostsList()}
                </div>
            </div>
        )
    }

    // Sidebar mode
    return (
        <div style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 2147483647,
            background: '#151d28', border: '1px solid #222e3f', borderRadius: '16px',
            width: `${dimensions?.width || 320}px`, height: `${dimensions?.height || 480}px`,
            minWidth: '250px', minHeight: '350px',
            maxWidth: '90vw', maxHeight: '90vh',
            overflow: 'hidden',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)', display: 'flex',
            flexDirection: 'column', fontFamily: 'sans-serif'
        }}>

            <div
                onMouseDown={(e) => {
                    if (!dimensions || !onDimensionsChange) return;
                    e.preventDefault();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startWidth = dimensions.width;
                    const startHeight = dimensions.height;

                    const onMouseMove = (moveEvent: MouseEvent) => {
                        const deltaX = startX - moveEvent.clientX;
                        const deltaY = startY - moveEvent.clientY;

                        onDimensionsChange({
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

            <div style={{ background: '#222e3f', padding: '12px 16px 12px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222e3f' }}>
                <h3 style={{ margin: 0, color: '#0f73ff', fontSize: '15px' }}>Puppytag Multisearch</h3>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {renderTagsList()}
                {renderPostsList()}
            </div>
        </div>
    )
}

