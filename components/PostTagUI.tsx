import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { useBlueskySession } from "../hooks/useBlueskySession"
import puppyTagIcon from "../assets/PuppyTagActionButton32px.png"

export function PostTagUI({ url, handle, rkey, suggestedTags = [] }: { url: string, handle: string, rkey: string, suggestedTags?: string[] }) {
    const [tags, setTags] = useState<{tag: string, score: number, userVote: number}[]>([])
    const [isAdding, setIsAdding] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false) // Controls visibility of the bottom section
    const [inputValue, setInputValue] = useState("")
    const [suggestions, setSuggestions] = useState<string[]>([])

    // State for tracking the dynamic toolbar portal target
    const [toolbarNode, setToolbarNode] = useState<HTMLElement | null>(null)

    const uiRef = useRef<HTMLDivElement>(null)
    const inputContainerRef = useRef<HTMLDivElement>(null)

    const { currentUserDid, currentUserHandle, currentUserJwt } = useBlueskySession()

    // Calculate which suggested tags haven't been added to the database yet
    const unaddedSuggestions = suggestedTags.filter(st => !tags.some(t => t.tag === st));

    // 2. Fetch Tags
    useEffect(() => {
        chrome.runtime.sendMessage(
            { action: "get_tags", payload: { rkey, voter_did: currentUserDid } },
            (response) => {
                if (response && response.data) {
                    setTags(response.data)
                    // Auto-expand the bottom section if the post already has tags
                    if (response.data.length > 0) {
                        setIsExpanded(true)
                    }
                }
            }
        )
    }, [rkey, currentUserDid])

    // --- UPDATED: Robust Portal Injection Logic ---
    useEffect(() => {
        let injectedNode: HTMLElement | null = null;

        const injectToolbarTarget = () => {
            if (!uiRef.current) return;

            const postContainer = uiRef.current.closest('div[data-testid^="feedItem"], div[data-testid^="postThreadItem"]');
            if (!postContainer) return;

            const dropdownBtn = postContainer.querySelector('[data-testid="postDropdownBtn"]');
            if (!dropdownBtn) return;

            // Bluesky uses React Native Web, which wraps elements in column-flex divs by default.
            // We must traverse UP to find the actual horizontal row container.
            let flexRowParent = dropdownBtn.parentElement;
            while (flexRowParent && flexRowParent !== document.body) {
                const style = window.getComputedStyle(flexRowParent);
                if (style.flexDirection === 'row') {
                    break;
                }
                flexRowParent = flexRowParent.parentElement;
            }

            // Fallback if somehow we can't find the row
            if (!flexRowParent || flexRowParent === document.body) {
                flexRowParent = dropdownBtn.parentElement;
            }

            // Prevent duplicating the wrapper node
            injectedNode = flexRowParent.querySelector('.puppytag-toolbar-node') as HTMLElement;
            if (!injectedNode) {
                injectedNode = document.createElement('div');
                injectedNode.className = 'puppytag-toolbar-node';
                injectedNode.style.display = 'flex';
                injectedNode.style.alignItems = 'center';
                injectedNode.style.justifyContent = 'center';

                // Prepend drops it at the very start of the row container
                flexRowParent.prepend(injectedNode);
            }
            setToolbarNode(injectedNode);
        };

        // Slight delay ensures Bluesky's DOM is completely mounted
        const timeoutId = setTimeout(injectToolbarTarget, 100);

        return () => {
            clearTimeout(timeoutId);
            if (injectedNode && injectedNode.parentNode) {
                injectedNode.remove();
            }
        };
    }, [rkey]); // Dependency changed to rkey so it doesn't unmount when tags are added

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
                accessJwt: currentUserJwt
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
            payload: { rkey, tag: tagToVote, voter_did: currentUserDid, vote: newVoteValue, accessJwt: currentUserJwt }
        })
    }

    const authorDeleteTag = (tagToDelete: string) => {
        setTags(prev => prev.filter(t => t.tag !== tagToDelete))
        chrome.runtime.sendMessage({
            action: "author_delete_tag",
            payload: { rkey, tag: tagToDelete, accessJwt: currentUserJwt }
        })
    }

    const getSuggestionText = () => {
        if (unaddedSuggestions.length === 1) return `Add #${unaddedSuggestions[0]}?`;
        if (unaddedSuggestions.length === 2) return `Add #${unaddedSuggestions[0]} and #${unaddedSuggestions[1]}?`;
        return `Add ${unaddedSuggestions.length} hashtags?`;
    };

    const activeTagObj = tags.find(t => t.tag === hoveredTag);

    // This is the specific blue-bordered inline button. 
    const addTagUI = isAdding ? (
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
                    animation: 'dropdownSlide 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards'
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
            style={{
                background: 'transparent',
                color: '#0085ff',
                border: '1px solid #0085ff',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '2px 8px',
                fontWeight: 'bold'
            }}
        >
            + 
        </button>
    );

    // Extracted the toggle button which sits purely in the Action Bar
    const toggleTagsUI = (
        <button
            className="tactile-btn"
            onClick={(e) => { stopPropagation(e); setIsExpanded(prev => !prev); }}
            style={{
                background: 'transparent',
                border: 'none',
                padding: '5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: 'scale(0.85)' // Match action bar icon size
            }}
            title="Toggle PuppyTags"
        >
            <img
                src={puppyTagIcon}
                alt="Toggle tags"
                style={{ width: '24px', height: '24px', display: 'block'}}
            />
        </button>
    );

    // To prevent total loss of UI if the toolbar portal fails, we ensure the bottom section 
    // is visible if we are missing a toolbarNode. Otherwise, rely on isExpanded.
    const isVisible = isExpanded || !toolbarNode;

    return (
        <>
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

            {/* Always push the toggle button to the action bar using Portal */}
            {toolbarNode && createPortal(toggleTagsUI, toolbarNode)}

            {/* Main Tags Area Container - Uses display none/flex to act as an expander while preserving the ref target */}
            <div ref={uiRef} style={{ display: isVisible ? 'flex' : 'none', gap: '8px', padding: '0px 14px 10px', flexWrap: 'wrap', alignItems: 'center' }}>

                {/* --- 1. THE TAG LOOP --- */}
                {tags.filter(t => t.score >= -3).map(({tag, score, userVote}) => {
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
                                animation: 'tagPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
                            }}
                        >
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

                {/* --- 3. ADD TAG INPUT / BUTTON --- */}
                {addTagUI}

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
                            animation: 'drawerRise 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards'
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
        </>
    )
}