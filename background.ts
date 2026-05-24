import { supabase } from "./supabase"

const WORKER_URL = "https://puppytag-worker.puppytag.workers.dev"

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {


    // Action 1: Save a new tag
    if (message.action === "save_tag") {
        const { post_url, post_author_handle, post_rkey, tag, author_did, accessJwt } = message.payload;

        if (!accessJwt) {
            console.error("User is not logged into Bluesky");
            return sendResponse({ error: "Not logged in" });
        }

        // Send everything to your secure Worker
        fetch(`${WORKER_URL}/save-tag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessJwt}`
            },
            body: JSON.stringify({ tag, post_url, post_author_handle, post_rkey, author_did })
        })
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                sendResponse({ error: null });
            })
            .catch(err => {
                console.error("Failed to save tag via Worker:", err);
                sendResponse({ error: err.message });
            });

        return true;
    }

    // Action 2: Fetch existing tags for a post
    if (message.action === "get_tags") {
        const { rkey, voter_did } = message.payload;

        Promise.resolve(
            supabase
                .from('tags_with_scores')
                .select('*')
                .eq('post_rkey', rkey)
        ).then(async ({ data: tagsData, error: tagsError }) => {
                if (tagsError) return sendResponse({ data: [], error: tagsError.message });
                if (!tagsData || tagsData.length === 0) return sendResponse({ data: [] });

                // Format the base data
                let finalData = tagsData.map(t => ({
                    tag: t.tag,
                    score: t.score,
                    userVote: 0
                }));

                // If logged in, fetch the user's past votes so we can highlight arrows
                if (voter_did) {
                    const { data: votesData } = await supabase
                        .from('tag_votes')
                        .select('tag, vote')
                        .eq('post_rkey', rkey)
                        .eq('voter_did', voter_did);

                    if (votesData && votesData.length > 0) {
                        finalData = finalData.map(t => {
                            const userVote = votesData.find(v => v.tag === t.tag)?.vote || 0;
                            return { ...t, userVote };
                        });
                    }
                }
                sendResponse({ data: finalData });
            }).catch(err => sendResponse({ data: [], error: err.message }));

        return true;
    }
    
    // Action: Vote on a tag
    if (message.action === "vote_tag") {
        const { rkey, tag, vote, accessJwt } = message.payload;

        if (!accessJwt) return sendResponse({ error: "Not logged in" });

        fetch(`${WORKER_URL}/vote-tag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessJwt}`
            },
            body: JSON.stringify({ rkey, tag, vote })
        })
            .then(res => res.json())
            .then(data => sendResponse({ error: data.error || null }))
            .catch(err => sendResponse({ error: err.message }));

        return true;
    }

    // Action: Author deletes a tag
    if (message.action === "author_delete_tag") {
        const { rkey, tag, accessJwt } = message.payload;

        if (!accessJwt) return sendResponse({ error: "Not logged in" });

        fetch(`${WORKER_URL}/author-delete-tag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessJwt}`
            },
            body: JSON.stringify({ rkey, tag })
        })
            .then(res => res.json())
            .then(data => sendResponse({ error: data.error || null }))
            .catch(err => sendResponse({ error: err.message }));

        return true;
    }
    

    // Action 3: Search for autocomplete suggestions
    if (message.action === "search_tags") {
        supabase
            .from('post_tags')
            .select('tag')
            // Using ilike to find tags that start with the user's input
            .ilike('tag', `${message.payload.query}%`)
            .limit(20)
            .then(({ data, error }) => {
                if (error) {
                    sendResponse({ data: [], error: error.message });
                } else {
                    // Because post_tags has many rows with the same tag, we filter to unique tags
                    const uniqueTags = Array.from(new Set(data.map(row => row.tag)));
                    sendResponse({ data: uniqueTags, error: null });
                }
            });
        return true;
    }

    // Action: Delete a tag (routed through Worker for auth)
    if (message.action === "delete_tag") {
        const { rkey, tag, accessJwt } = message.payload;

        if (!accessJwt) return sendResponse({ error: "Not logged in" });

        fetch(`${WORKER_URL}/delete-tag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessJwt}`
            },
            body: JSON.stringify({ rkey, tag })
        })
            .then(res => res.json())
            .then(data => sendResponse({ error: data.error || null }))
            .catch(err => sendResponse({ error: err.message }));

        return true;
    }

    if (message.action === "get_posts_by_multi_tags") {
        const { tags } = message.payload;

        if (!tags || tags.length === 0) {
            sendResponse({ data: [] });
            return true;
        }

        // Fetch records for all tags in parallel
        Promise.all(tags.map(tag =>
            supabase
                .from('post_tags')
                .select('post_rkey, author_did')
                .eq('tag', tag)
                .eq('author_deleted', false)
        )).then(results => {
            if (results.some(r => r.error)) {
                sendResponse({ error: "Failed to fetch multi-tag data" });
                return;
            }

            // Find the intersection (posts that have ALL the selected tags)
            let commonPosts = results[0].data?.map(d => ({ rkey: d.post_rkey, did: d.author_did })) || [];

            for (let i = 1; i < results.length; i++) {
                const currentRkeys = new Set(results[i].data?.map(d => d.post_rkey) || []);
                commonPosts = commonPosts.filter(p => currentRkeys.has(p.rkey));
            }

            // Remove any duplicates
            const uniquePosts = Array.from(new Map(commonPosts.map(p => [p.rkey, p])).values());

            sendResponse({ data: uniquePosts });
        });

        return true;
    }

    // Action: Search native Bluesky tags (Bypasses CORS)
    if (message.action === "search_native_tags") {
        const { tags } = message.payload;

        if (!tags || tags.length === 0) {
            sendResponse({ data: [] });
            return true;
        }

        const params = new URLSearchParams();

        // 'q' is a required parameter, so we provide the tags as a space-separated string
        params.append('q', tags.join(' '));
        params.append('limit', '30');

        // Append each tag to the dedicated 'tag' parameter for strict AND matching. 
        // The API specifies to omit the '#' prefix here.
        tags.forEach((t: string) => {
            params.append('tag', t);
        });

        fetch(`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?${params.toString()}`)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                return res.json();
            })
            .then(data => sendResponse({ data: data.posts || [] }))
            .catch(err => {
                console.error("Background fetch native tags failed:", err);
                sendResponse({ error: err.message, data: [] });
            });

        return true;
    }
});