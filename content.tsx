import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState, useRef } from "react"
import { createRoot } from "react-dom/client"
import { createPortal } from "react-dom"
export const config: PlasmoCSConfig = {
    matches: ["https://bsky.app/*"]
}

// -----------------------------------------------------
// 1. UI injected into individual posts
// -----------------------------------------------------
function PostTagUI({ url, handle, rkey, suggestedTags = [] }: { url: string, handle: string, rkey: string, suggestedTags?: string[] }) {
    const [tags, setTags] = useState<{tag: string, score: number, userVote: number}[]>([])
    const [isAdding, setIsAdding] = useState(false)
    const [inputValue, setInputValue] = useState("")
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [currentUserDid, setCurrentUserDid] = useState<string | null>(null)
    const [currentUserHandle, setCurrentUserHandle] = useState<string | null>(null)
    const [currentUserJwt, setCurrentUserJwt] = useState<string | null>(null)

    const uiRef = useRef<HTMLDivElement>(null)
    const inputContainerRef = useRef<HTMLDivElement>(null)

    // Calculate which suggested tags haven't been added to the database yet
    const unaddedSuggestions = suggestedTags.filter(st => !tags.some(t => t.tag === st));

    // 1. Get the current user's session from Bluesky's localStorage
    useEffect(() => {
        try {
            const sessionStr = localStorage.getItem("BSKY_STORAGE")
            if (sessionStr) {
                const session = JSON.parse(sessionStr)
                const account = session?.session?.currentAccount

                if (account?.did) setCurrentUserDid(account.did)
                if (account?.handle) setCurrentUserHandle(account.handle)
                // Grab the access token!
                if (account?.accessJwt) setCurrentUserJwt(account.accessJwt)
            }
        } catch (e) {
            console.error("Could not parse Bluesky session", e)
        }
    }, [])

    // 2. Fetch Tags
    useEffect(() => {
        chrome.runtime.sendMessage(
            { action: "get_tags", payload: { rkey, voter_did: currentUserDid } },
            (response) => {
                if (response && response.data) setTags(response.data)
            }
        )
    }, [rkey, currentUserDid])

    //Render on top tag behavior
    const [hoveredTag, setHoveredTag] = useState<string | null>(null)
    const [drawerCoords, setDrawerCoords] = useState<{ top: number, left: number } | null>(null)
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Hide the portal immediately if the user scrolls, so it doesn't detach from the post
    useEffect(() => {
        const handleScroll = () => setHoveredTag(null)
        if (hoveredTag) window.addEventListener('scroll', handleScroll, true) // 'true' catches all scroll events
        return () => window.removeEventListener('scroll', handleScroll, true)
    }, [hoveredTag])

    const handleMouseEnter = (tag: string, event: React.MouseEvent<HTMLElement>) => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)

        // Calculate exactly where the tag is on the screen
        const rect = event.currentTarget.getBoundingClientRect()
        setDrawerCoords({
            top: rect.bottom + 4, // 4px below the tag
            left: rect.left + (rect.width / 2) // Center horizontally
        })
        setHoveredTag(tag)
    }

    const handleMouseLeave = () => {
        // Give the user 150ms to move their mouse from the tag into the floating drawer
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredTag(null)
        }, 150)
    }
    
    // Render on top ALWAYS
    useEffect(() => {
        if (!isAdding && !hoveredTag) return;

        const postContainer = uiRef.current?.closest('div[data-testid^="feedItem"], div[data-testid^="postThreadItem"]') as HTMLElement;
        const modifiedElements: { el: HTMLElement, originalZIndex: string, originalPosition: string }[] = [];

        if (postContainer) {
            let current: HTMLElement | null = postContainer;
            let depth = 0;
            const MAX_DEPTH = 5;

            while (current && current.tagName !== 'BODY' && depth < MAX_DEPTH) {
                modifiedElements.push({
                    el: current,
                    originalZIndex: current.style.zIndex,
                    originalPosition: current.style.position
                });

                const computedStyle = window.getComputedStyle(current);
                if (computedStyle.position === 'static') {
                    current.style.position = "relative";
                }

                current.style.zIndex = "2147483647";

                current = current.parentElement;
                depth++;
            }
        }

        return () => {
            modifiedElements.forEach(({ el, originalZIndex, originalPosition }) => {
                el.style.zIndex = originalZIndex;
                el.style.position = originalPosition;
            });
        };
    }, [isAdding, hoveredTag])

    // Click outside to cancel
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (inputContainerRef.current && !inputContainerRef.current.contains(e.target as Node)) {
                setIsAdding(false)
                setInputValue("")
                setSuggestions([])
            }
        }

        if (isAdding) {
            document.addEventListener("mousedown", handleClickOutside)
        }
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [isAdding])

    // Handle tag search
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

    const stopPropagation = (e: React.SyntheticEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const saveTagToDB = async (cleanTag: string, authorDid: string) => {
        chrome.runtime.sendMessage({
            action: "save_tag",
            payload: {
                post_url: url,
                post_author_handle: handle,
                author_did: authorDid,
                post_rkey: rkey,
                tag: cleanTag,
                voter_did: currentUserDid,
                accessJwt: currentUserJwt // <-- Pass the token
            }
        }, (response) => {
            if (response && response.error && !response.error.includes('duplicate key')) {
                alert(`Failed to save tag #${cleanTag}: ` + response.error)
                setTags(prev => prev.filter(t => t.tag !== cleanTag))
            }
        })
    }
    
    const submitTag = async (tagText: string) => {
        const cleanTag = tagText.toLowerCase().trim()
        if (!cleanTag) return

        setIsAdding(false)
        setInputValue("")
        setSuggestions([])

        if (!tags.some(t => t.tag === cleanTag)) {
            setTags(prev => [...prev, { tag: cleanTag, score: 1, userVote: 1 }])
        }

        try {
            // Updated to use public.api.bsky.app
            const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`)
            if (!res.ok) throw new Error("Failed to resolve handle")
            const { did } = await res.json()
            saveTagToDB(cleanTag, did);
        } catch (error) {
            console.error(`Failed to submit tag #${cleanTag}:`, error)
        }
    }

    const submitSuggestedTags = async () => {
        try {
            // Updated to use public.api.bsky.app
            const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`)
            if (!res.ok) throw new Error("Failed to resolve handle")
            const { did } = await res.json()

            unaddedSuggestions.forEach(tag => {
                setTags(prev => [...prev, { tag, score: 1, userVote: 1 }])
                saveTagToDB(tag, did);
            });
        } catch (error) {
            console.error("Failed to submit suggested tags:", error)
        }
    }

    const handleVote = (tagToVote: string, requestedVote: number) => {
        if (!currentUserDid) return alert("You must be logged in to vote.")

        let newVoteValue = requestedVote;

        setTags(prev => prev.map(t => {
            if (t.tag !== tagToVote) return t;
            if (t.userVote === requestedVote) newVoteValue = 0;
            const scoreDiff = newVoteValue - (t.userVote || 0);
            return { ...t, score: t.score + scoreDiff, userVote: newVoteValue };
        }))

        chrome.runtime.sendMessage({
            action: "vote_tag",
            payload: { rkey, tag: tagToVote, voter_did: currentUserDid, vote: newVoteValue, accessJwt: currentUserJwt } // <-- Pass the token
        })
    }

    const authorDeleteTag = (tagToDelete: string) => {
        setTags(prev => prev.filter(t => t.tag !== tagToDelete))
        chrome.runtime.sendMessage({
            action: "author_delete_tag",
            payload: { rkey, tag: tagToDelete, accessJwt: currentUserJwt } // <-- Pass the token
        })
    }

    const getSuggestionText = () => {
        if (unaddedSuggestions.length === 1) return `Add #${unaddedSuggestions[0]}?`;
        if (unaddedSuggestions.length === 2) return `Add #${unaddedSuggestions[0]} and #${unaddedSuggestions[1]}?`;
        return `Add ${unaddedSuggestions.length} hashtags?`;
    };

    const activeTagObj = tags.find(t => t.tag === hoveredTag);

    return (
        <div ref={uiRef} style={{ display: 'flex', gap: '8px', padding: '0px 14px 10px', flexWrap: 'wrap', alignItems: 'center' }}>

            {/* INJECTED KEYFRAMES FOR ANIMATIONS */}
            <style>{`
            @keyframes tagPop {
                0% { opacity: 0; transform: scale(0.85); }
                100% { opacity: 1; transform: scale(1); }
            }
            @keyframes dropdownSlide {
                0% { opacity: 0; transform: translateY(-6px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes drawerRise {
                0% { opacity: 0; transform: translateX(-50%) translateY(8px); }
                100% { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
            .tactile-btn { transition: transform 0.1s ease, background 0.2s ease, color 0.2s ease; }
            .tactile-btn:active { transform: scale(0.92); }
        `}</style>

            {/* --- 1. THE TAG LOOP --- */}
            {tags.filter(t => t.score >= -3 || t.userVote !== 0).map(({tag, score, userVote}) => {
                const isHovered = hoveredTag === tag;

                return (
                    <div
                        key={tag}
                        onMouseEnter={(e) => handleMouseEnter(tag, e)}
                        onMouseLeave={handleMouseLeave}
                        style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            animation: 'tagPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' // Bouncy entrance
                        }}
                    >
                        {/* Main Tag Pill */}
                        <a
                            className="tactile-btn"
                            href={`/profile/puppytag.bsky.social/feed/${tag}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: '#1e293b', borderRadius: '16px', padding: '2px 8px',
                                color: '#fff', fontSize: '12px', fontWeight: 'bold', textDecoration: 'none',
                                boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.4)' : 'none'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#1e293b'}
                        >
                            #{tag}
                        </a>

                        {/* Floating Delete Bubble */}
                        {currentUserHandle === handle && (
                            <button
                                className="tactile-btn"
                                onClick={(e) => { e.stopPropagation(); authorDeleteTag(tag); }}
                                style={{
                                    position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px',
                                    background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '10px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                                    zIndex: 10, opacity: isHovered ? 1 : 0, transform: isHovered ? 'scale(1)' : 'scale(0.5)',
                                    transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                    pointerEvents: isHovered ? 'auto' : 'none'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                );
            })}

            {/* --- 2. SUGGESTED TAGS --- */}
            {unaddedSuggestions.length > 0 && !isAdding && (
                <button
                    className="tactile-btn"
                    onClick={(e) => { stopPropagation(e); submitSuggestedTags(); }}
                    style={{ background: 'transparent', color: '#10b981', border: '1px solid #10b981', borderRadius: '12px', cursor: 'pointer', fontSize: '12px', padding: '2px 8px', fontWeight: 'bold' }}
                >
                    + {getSuggestionText()}
                </button>
            )}

            {/* --- 3. ADD TAG INPUT --- */}
            {isAdding ? (
                <div
                    ref={inputContainerRef}
                    style={{ position: 'relative', animation: 'tagPop 0.2s ease-out forwards' }}
                    onClick={stopPropagation}
                >
                    <input
                        autoFocus
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="type tag..."
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') submitTag(inputValue);
                            if (e.key === 'Escape') {
                                setIsAdding(false);
                                setInputValue("");
                            }
                        }}
                        style={{
                            background: '#161e27', color: '#fff', border: '1px solid #0085ff',
                            borderRadius: '12px', padding: '2px 8px', fontSize: '12px',
                            outline: 'none', width: '120px',
                            transition: 'box-shadow 0.2s ease',
                            boxShadow: '0 0 0 2px rgba(0, 133, 255, 0.2)'
                        }}
                    />

                    {inputValue && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                            backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            zIndex: 2147483647, minWidth: '100%', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.8)',
                            whiteSpace: 'nowrap',
                            animation: 'dropdownSlide 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards' // Smooth slide down
                        }}>
                            {!suggestions.includes(inputValue) && (
                                <div
                                    onClick={(e) => { stopPropagation(e); submitTag(inputValue); }}
                                    style={{ padding: '6px 10px', fontSize: '12px', color: '#38bdf8', cursor: 'pointer', borderBottom: '1px solid #334155', fontWeight: 'bold', transition: 'background 0.1s ease' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#0f172a'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    Create "#{inputValue}"
                                </div>
                            )}

                            {suggestions.map(s => (
                                <div
                                    key={s}
                                    onClick={(e) => { stopPropagation(e); submitTag(s); }}
                                    style={{ padding: '6px 10px', fontSize: '12px', color: '#fff', cursor: 'pointer', transition: 'background 0.1s ease' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#0f172a'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    #{s}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <button
                    className="tactile-btn"
                    onClick={(e) => { stopPropagation(e); setIsAdding(true); }}
                    style={{ background: 'transparent', color: '#0085ff', border: '1px solid #0085ff', borderRadius: '12px', cursor: 'pointer', fontSize: '12px', padding: '2px 8px', fontWeight: 'bold' }}
                >
                    + Add Tag
                </button>
            )}

            {/* --- 4. THE PORTALED DRAWER --- */}
            {hoveredTag && activeTagObj && drawerCoords && createPortal(
                <div
                    onMouseEnter={() => { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); }}
                    onMouseLeave={handleMouseLeave}
                    style={{
                        position: 'fixed',
                        top: `${drawerCoords.top}px`,
                        left: `${drawerCoords.left}px`,
                        display: 'flex', alignItems: 'center', background: '#0f172a',
                        borderRadius: '12px', padding: '2px 8px', gap: '8px',
                        zIndex: 2147483647,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                        whiteSpace: 'nowrap',
                        animation: 'drawerRise 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards' // Slide up and fade in
                    }}
                >
                    <button
                        className="tactile-btn"
                        onClick={(e) => { e.stopPropagation(); handleVote(activeTagObj.tag, 1); }}
                        style={{
                            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                            color: activeTagObj.userVote === 1 ? '#38bdf8' : '#94a3b8',
                            display: 'flex', alignItems: 'center'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#38bdf8'}
                        onMouseLeave={(e) => e.currentTarget.style.color = activeTagObj.userVote === 1 ? '#38bdf8' : '#94a3b8'}
                    >
                        ▲
                    </button>

                    <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }}>
                    {activeTagObj.score}
                </span>

                    <button
                        className="tactile-btn"
                        onClick={(e) => { e.stopPropagation(); handleVote(activeTagObj.tag, -1); }}
                        style={{
                            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                            color: activeTagObj.userVote === -1 ? '#ef4444' : '#94a3b8',
                            display: 'flex', alignItems: 'center'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={(e) => e.currentTarget.style.color = activeTagObj.userVote === -1 ? '#ef4444' : '#94a3b8'}
                    >
                        ▼
                    </button>
                </div>,
                document.body
            )}
        </div>
    )
}

// -----------------------------------------------------
// 3. Floating Multi-Tag Explorer UI
// -----------------------------------------------------
function MultiTagSidebar() {
    const [isOpen, setIsOpen] = useState(false)
    const [inputValue, setInputValue] = useState("")
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [postDetails, setPostDetails] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)

    // New state to track custom dimensions
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
            width: `${dimensions.width}px`, height: `${dimensions.height}px`, // Using JS state
            minWidth: '250px', minHeight: '350px',
            maxWidth: '90vw', maxHeight: '90vh',
            overflow: 'hidden', // Native resize removed
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)', display: 'flex',
            flexDirection: 'column', fontFamily: 'sans-serif'
        }}>

            {/* Custom Top-Left Resizer Handle */}
            <div
                onMouseDown={(e) => {
                    e.preventDefault();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startWidth = dimensions.width;
                    const startHeight = dimensions.height;

                    const onMouseMove = (moveEvent: MouseEvent) => {
                        // Moving left/up (negative mouse delta) means increasing width/height
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
                {/* Visual triangle for the grabber */}
                <svg width="12" height="12" viewBox="0 0 12 12" style={{ margin: '4px 0 0 4px' }}>
                    <path d="M0,0 L12,0 L0,12 Z" fill="#64748b" />
                </svg>
            </div>

            {/* Header */}
            {/* Added extra left padding (28px) so the text doesn't sit under the grabber */}
            <div style={{ background: '#1e293b', padding: '12px 16px 12px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' }}>
                <h3 style={{ margin: 0, color: '#38bdf8', fontSize: '15px' }}>Puppytag Multisearch</h3>
                <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Selected Tags */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                    {selectedTags.map(tag => (
                        <span key={tag} style={{ background: "#1e293b", padding: "4px 8px", borderRadius: "12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", color: '#fff' }}>
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
                        placeholder="Search tags..."
                        onKeyDown={(e) => { if (e.key === 'Enter') addTag(inputValue) }}
                        style={{ width: "100%", boxSizing: "border-box", background: "#161e27", color: "#fff", border: "1px solid #334155", borderRadius: "8px", padding: "8px", outline: "none" }}
                    />

                    {/* Autocomplete Dropdown */}
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

                {/* Results Area */}
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

// -----------------------------------------------------
// 4. The Engine that scans the scrolling feed
// -----------------------------------------------------
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

                // Check if our specific wrapper class exists instead of relying on datasets
                if (container && !container.querySelector('.bsky-tagger-ui')) {

                    const postTextElement = container.querySelector('div[data-testid="postText"]');
                    const textContent = postTextElement ? postTextElement.textContent : "";
                    const hashtagMatches = textContent?.match(/#([a-zA-Z0-9_]+)/g);

                    const suggestedTags = hashtagMatches
                        ? Array.from(new Set(hashtagMatches.map(t => t.slice(1).toLowerCase())))
                        : [];

                    const wrapper = document.createElement("div")
                    wrapper.className = "bsky-tagger-ui" // Add a class to track injection
                    wrapper.style.width = "100%" // Ensure it spans the post width
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