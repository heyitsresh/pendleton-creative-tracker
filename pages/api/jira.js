// pages/api/jira.js
// READ-ONLY — fetches open Pendleton tasks from Jira. Never writes, edits, or transitions anything.
export default async function handler(req, res) {
  const email = process.env.JIRA_EMAIL
  const token = process.env.JIRA_API_TOKEN

  if (!email || !token) {
    return res.status(500).json({
      error: 'JIRA_EMAIL and JIRA_API_TOKEN are not set. Add them in Vercel → Settings → Environment Variables.'
    })
  }

  const auth   = Buffer.from(`${email}:${token}`).toString('base64')
  const JQL    = 'project = "CREATE" AND statusCategory != Done AND cf[10866] = "Pendleton: AMZ" ORDER BY updated DESC'
  const FIELDS = ['summary', 'status', 'assignee', 'priority', 'labels', 'updated', 'duedate', 'parent', 'issuetype']

  try {
    // Atlassian deprecated POST /rest/api/3/search — use /rest/api/3/search/jql with cursor pagination
    let all = [], nextPageToken = undefined

    while (true) {
      const body = { jql: JQL, fields: FIELDS, maxResults: 100 }
      if (nextPageToken) body.nextPageToken = nextPageToken

      const r = await fetch('https://ave7.atlassian.net/rest/api/3/search/jql', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type':  'application/json',
          'Accept':        'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!r.ok) {
        const text = await r.text()
        return res.status(r.status).json({ error: text })
      }

      const data = await r.json()
      const page = data.issues || data.values || []
      all = all.concat(page)

      // Stop if no next page or empty batch
      if (!data.nextPageToken || page.length === 0) break
      nextPageToken = data.nextPageToken
    }

    const mapped = all.map(issue => ({
      key:       issue.key,
      url:       `https://ave7.atlassian.net/browse/${issue.key}`,
      summary:   issue.fields.summary  || '—',
      status:    issue.fields.status?.name || '—',
      statusCat: issue.fields.status?.statusCategory?.name || '',
      assignee:  issue.fields.assignee?.displayName || 'Unassigned',
      priority:  issue.fields.priority?.name || '—',
      labels:    issue.fields.labels  || [],
      updated:   issue.fields.updated || '',
      duedate:   issue.fields.duedate || '',
      parentKey: issue.fields.parent?.key || '',
      parentSum: issue.fields.parent?.fields?.summary || issue.fields.parent?.key || '',
    }))

    return res.status(200).json(mapped)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
