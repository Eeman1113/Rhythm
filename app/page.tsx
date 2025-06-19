"use client"

import React, { useState, useEffect, useRef } from "react"
import { Brain, Feather, Bot, Loader2, Wand2, Send, Sparkles, User } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

// --- User's API Key for Local Development ---
// For the live preview, the key is hardcoded. For local setup, use an environment variable.
const GEMINI_API_KEY = "AIzaSyCTyBJ5dQZoWWgB14Wjd0l7heigxDRT-qs"

// --- Agent Definitions ---
const AGENTS = {
  BRAINSTORMER: {
    name: "Brainstormer",
    icon: <Brain className="w-5 h-5" />,
    prompt:
      "You are a creative partner, an expert brainstormer. Your goal is to provide ideas, outlines, and creative suggestions. Don't edit directly, but inspire. Based on the document, help the user with their request.",
    canEdit: false,
  },
  EDITOR: {
    name: "Editor",
    icon: <Feather className="w-5 h-5" />,
    prompt:
      "You are a meticulous editor. Your role is to check for grammar, spelling, style, and clarity. Suggest improvements but do not rewrite the whole document unless asked. Based on the document, help the user with their request.",
    canEdit: false,
  },
  GHOSTWRITER: {
    name: "Ghostwriter",
    icon: <Bot className="w-5 h-5" />,
    prompt:
      "You are a collaborative ghostwriter. Your task is to directly modify the document based on the user's instructions. You MUST respond with a JSON object containing two keys: 'explanation' (a brief summary of your changes) and 'newContent' (the complete, modified text).",
    canEdit: true,
  },
  LIVE_FEEDBACK: {
    name: "Live Feedback",
    prompt:
      "You are a subtle writing assistant. You will be given a single paragraph of text. Your task is to provide one or two concise, constructive suggestions for improvement in 20-30 words. Focus on clarity, grammar, and style. If there are no obvious issues, respond with a brief, encouraging comment like 'This looks clear and well-written.' Do not be conversational. Your response must be plain text.",
  },
}

// --- Helper Function to find current paragraph with its indices ---
const getCurrentParagraph = (text: string, cursorPosition: number) => {
  if (!text) return { paragraph: null, start: 0, end: 0 }
  let start = text.lastIndexOf("\n\n", cursorPosition - 1) + 2
  if (start < 2) start = 0 // Handles the first paragraph
  let end = text.indexOf("\n\n", cursorPosition)
  if (end === -1) end = text.length
  const paragraph = text.substring(start, end)
  return paragraph.trim().length > 20 ? { paragraph, start, end } : { paragraph: null, start: 0, end: 0 }
}

interface ChatMessage {
  role: "user" | "model"
  text: string
  agent?: string
}

interface ParagraphInfo {
  paragraph: string
  start: number
  end: number
}

// --- Main App Component ---
export default function App() {
  // --- State Management (Local State Only) ---
  const initialContent = `# Welcome to Rhythm!\n\nStart writing here. Your work will be available for this session.\n\nUse the AI assistant on the right to help you write. As you type, you'll see live feedback appear below this editor.`
  const [content, setContent] = useState(initialContent)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [selectedAgent, setSelectedAgent] = useState("BRAINSTORMER")
  const [prompt, setPrompt] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false)
  const [isApplyingFeedback, setIsApplyingFeedback] = useState(false)
  const [error, setError] = useState("")
  const [liveFeedback, setLiveFeedback] = useState("")
  const [paragraphInfoForFeedback, setParagraphInfoForFeedback] = useState<ParagraphInfo | null>(null)

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // --- Effect to scroll chat to bottom ---
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatHistory])

  // --- Live Feedback API call ---
  const fetchLiveFeedback = async (paragraphInfo: ParagraphInfo) => {
    if (!paragraphInfo || !paragraphInfo.paragraph || !GEMINI_API_KEY) return
    setParagraphInfoForFeedback(paragraphInfo)
    setIsFeedbackLoading(true)
    setLiveFeedback("")
    try {
      const fullPrompt = `${AGENTS.LIVE_FEEDBACK.prompt}\n\n--- PARAGRAPH ---\n${paragraphInfo.paragraph}`
      const payload = { contents: [{ role: "user", parts: [{ text: fullPrompt }] }] }
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`API request failed`)
      const result = await response.json()
      setLiveFeedback(result.candidates?.[0]?.content?.parts?.[0]?.text || "")
    } catch (e) {
      console.error("Live feedback error:", e)
      setLiveFeedback("Could not get feedback at this time.")
    } finally {
      setIsFeedbackLoading(false)
    }
  }

  const handleApplyFeedback = async () => {
    if (!paragraphInfoForFeedback || !liveFeedback || !GEMINI_API_KEY) return
    setIsApplyingFeedback(true)

    const ghostwriterPrompt = `Based on the following paragraph and the suggested edit, please rewrite the paragraph to incorporate the feedback. Return ONLY the rewritten paragraph text, with no extra formatting or explanation.\n\n--- ORIGINAL PARAGRAPH ---\n${paragraphInfoForFeedback.paragraph}\n\n--- SUGGESTED EDIT ---\n${liveFeedback}`

    try {
      const payload = { contents: [{ role: "user", parts: [{ text: ghostwriterPrompt }] }] }
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error("Failed to get rewritten paragraph.")

      const result = await response.json()
      const rewrittenParagraph = result.candidates?.[0]?.content?.parts?.[0]?.text

      if (rewrittenParagraph) {
        const { start, end } = paragraphInfoForFeedback
        const newFullContent = content.substring(0, start) + rewrittenParagraph + content.substring(end)
        const ghostwriterMessage: ChatMessage = {
          role: "model",
          agent: "GHOSTWRITER",
          text: "I've applied the suggested edit to the paragraph.",
        }

        setContent(newFullContent)
        setChatHistory([...chatHistory, ghostwriterMessage])
      }
    } catch (e) {
      console.error("Error applying feedback:", e)
      setError("Failed to apply feedback.")
    } finally {
      setIsApplyingFeedback(false)
      setLiveFeedback("")
      setParagraphInfoForFeedback(null)
    }
  }

  // --- Event Handlers ---
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    const cursorPosition = e.target.selectionStart
    setContent(newContent)

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current)
    setIsFeedbackLoading(false)
    setLiveFeedback("")
    setParagraphInfoForFeedback(null)

    debounceTimeoutRef.current = setTimeout(() => {
      const currentParagraphInfo = getCurrentParagraph(newContent, cursorPosition)
      if (currentParagraphInfo.paragraph) {
        fetchLiveFeedback(currentParagraphInfo)
      }
    }, 1500)
  }

  const handleSendPrompt = async () => {
    if (!prompt.trim() || !GEMINI_API_KEY) return
    setIsLoading(true)
    setError("")

    const userMessage: ChatMessage = { role: "user", text: prompt }
    setChatHistory((prev) => [...prev, userMessage])
    setPrompt("")

    try {
      const agent = AGENTS[selectedAgent as keyof typeof AGENTS]
      const fullPrompt = `${agent.prompt}\n\n--- DOCUMENT CONTENT ---\n${content}\n\n--- USER REQUEST ---\n${prompt}`
      const payload: any = { contents: [{ role: "user", parts: [{ text: fullPrompt }] }] }
      if (agent.canEdit)
        payload.generationConfig = {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: { explanation: { type: "STRING" }, newContent: { type: "STRING" } },
            required: ["explanation", "newContent"],
          },
        }

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`API request failed`)
      const result = await response.json()

      let botMessageText = "Sorry, I couldn't generate a response."

      if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        if (agent.canEdit) {
          const jsonResponse = JSON.parse(result.candidates[0].content.parts[0].text)
          botMessageText = jsonResponse.explanation
          const newContentFromAI = jsonResponse.newContent

          const botMessage: ChatMessage = { role: "model", text: botMessageText, agent: selectedAgent }
          setContent(newContentFromAI)
          setChatHistory((prev) => [...prev, botMessage])
        } else {
          botMessageText = result.candidates[0].content.parts[0].text
          const botMessage: ChatMessage = { role: "model", text: botMessageText, agent: selectedAgent }
          setChatHistory((prev) => [...prev, botMessage])
        }
      } else {
        const botMessage: ChatMessage = { role: "model", text: botMessageText, agent: selectedAgent }
        setChatHistory((prev) => [...prev, botMessage])
      }
    } catch (e) {
      console.error("Gemini API error:", e)
      setError("An error occurred.")
      const botMessage: ChatMessage = {
        role: "model",
        text: "An error occurred. Please check your API key and try again.",
        agent: selectedAgent,
      }
      setChatHistory((prev) => [...prev, botMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <style>{`
  @keyframes slide-up-fade {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pop-in {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  .animate-slide-up-fade {
    animation: slide-up-fade 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }
  .chat-log-item {
    animation: pop-in 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }
  ::selection {
    background-color: rgba(167, 139, 250, 0.4);
  }
  ::-moz-selection {
    background-color: rgba(167, 139, 250, 0.4);
  }
  .dark ::selection {
    background-color: rgba(139, 92, 246, 0.5);
  }
  .dark ::-moz-selection {
    background-color: rgba(139, 92, 246, 0.5);
  }
`}</style>
      <div className="flex flex-col md:flex-row h-screen bg-slate-50 dark:bg-gray-950 font-sans text-slate-800 dark:text-gray-100 transition-colors duration-300">
        {/* Background patterns */}
        <div className="fixed inset-0 -z-10 h-full w-full bg-white dark:bg-gray-950 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:14px_24px]"></div>
        <div className="fixed left-0 top-0 -z-10 h-1/3 w-2/3 bg-gradient-to-br from-purple-200/50 via-white to-white dark:from-violet-500/10 dark:via-gray-950 dark:to-gray-950 blur-3xl"></div>
        <div className="fixed right-0 bottom-0 -z-10 h-1/3 w-2/3 bg-gradient-to-tl from-indigo-200/50 via-white to-white dark:from-blue-500/10 dark:via-gray-950 dark:to-gray-950 blur-3xl"></div>

        {/* Main Editor Pane */}
        <main className="flex-[2] flex flex-col p-4 md:p-6 lg:p-8 animate-slide-up-fade">
          <header className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-white/80 dark:border-gray-700/50 rounded-xl flex items-center justify-center shadow-lg shadow-gray-200/50 dark:shadow-black/20">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-indigo-500 dark:text-violet-400"
                >
                  <path
                    d="M4 22C4 17.5817 7.58172 14 12 14C16.4183 14 20 17.5817 20 22H4Z"
                    fill="currentColor"
                    fillOpacity="0.5"
                  />
                  <path
                    d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-100 tracking-tight">Rhythm</h1>
            </div>
            <ThemeToggle />
          </header>

          {/* Editor Container */}
          <div className="flex-grow w-full h-full flex flex-col bg-white/80 dark:bg-gray-900/50 backdrop-blur-lg rounded-2xl shadow-xl shadow-gray-200/60 dark:shadow-black/20 border border-white/80 dark:border-gray-700/30 overflow-hidden">
            <textarea
              value={content}
              onChange={handleContentChange}
              className="w-full flex-grow p-6 md:p-8 resize-none bg-transparent text-slate-700 dark:text-gray-200 placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none leading-relaxed tracking-wide text-lg"
              placeholder="Start your masterpiece..."
            />
            {/* Live Feedback Bar */}
            <div className="bg-white/60 dark:bg-gray-800/40 backdrop-blur-lg p-4 border-t border-white/80 dark:border-gray-700/30 min-h-[80px] flex items-center transition-all duration-300">
              <div className="flex items-center gap-3 text-indigo-500 dark:text-violet-400">
                <Wand2 className="w-6 h-6" />
              </div>
              <div className="flex-grow pl-4 text-sm text-slate-500 dark:text-gray-400 h-12 flex items-center">
                {isFeedbackLoading && (
                  <div className="flex items-center gap-2 animate-slide-up-fade">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing your prose...
                  </div>
                )}
                {!isFeedbackLoading && liveFeedback && (
                  <div className="flex items-center justify-between w-full animate-slide-up-fade">
                    <p className="flex-grow pr-4 italic">"{liveFeedback}"</p>
                    <button
                      onClick={handleApplyFeedback}
                      disabled={isApplyingFeedback || isLoading}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-500 dark:bg-violet-500 hover:bg-indigo-600 dark:hover:bg-violet-600 rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/30 dark:shadow-violet-500/30 transform active:scale-95"
                    >
                      {isApplyingFeedback ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}{" "}
                      Apply
                    </button>
                  </div>
                )}
                {!isFeedbackLoading && !liveFeedback && (
                  <p className="text-slate-400 dark:text-gray-500">
                    Pause typing to get live feedback on your current paragraph.
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* AI Assistant Pane */}
        <aside
          className="flex-[1] flex flex-col bg-white/60 dark:bg-gray-900/40 backdrop-blur-lg border-l border-white/80 dark:border-gray-700/30 animate-slide-up-fade"
          style={{ animationDelay: "0.1s" }}
        >
          <div className="p-6 border-b border-white/80 dark:border-gray-700/30">
            <h2 className="text-xl font-bold text-slate-900 dark:text-gray-100">AI Assistant</h2>
            {/* Agent Selector */}
            <div className="flex items-center bg-white/70 dark:bg-gray-800/50 border border-white/80 dark:border-gray-700/40 p-1 rounded-full mt-4 relative shadow-md shadow-gray-200/50 dark:shadow-black/20">
              {Object.keys(AGENTS)
                .filter((k) => k !== "LIVE_FEEDBACK")
                .map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedAgent(key)}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors duration-300 relative z-10 ${selectedAgent === key ? "text-white" : "text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200"}`}
                  >
                    {AGENTS[key as keyof typeof AGENTS].icon} {AGENTS[key as keyof typeof AGENTS].name}
                  </button>
                ))}
              <div
                className={`absolute top-1 bottom-1 w-1/3 bg-indigo-500 dark:bg-violet-500 rounded-full shadow-md shadow-indigo-500/30 dark:shadow-violet-500/30 transition-transform duration-300 ease-in-out ${selectedAgent === "BRAINSTORMER" ? "translate-x-0" : selectedAgent === "EDITOR" ? "translate-x-full" : "translate-x-[200%]"}`}
              ></div>
            </div>
          </div>

          {/* Chat History */}
          <div className="flex-grow p-6 overflow-y-auto">
            <div className="space-y-6">
              {chatHistory.map((msg, index) => (
                <div key={index} className="flex flex-col items-start gap-3 chat-log-item">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm ${msg.role === "user" ? "bg-slate-200 dark:bg-gray-700" : "bg-indigo-500 dark:bg-violet-500"}`}
                    >
                      {msg.role === "user" ? (
                        <User className="w-4 h-4 text-slate-600 dark:text-gray-300" />
                      ) : (
                        React.cloneElement(AGENTS[msg.agent as keyof typeof AGENTS]?.icon || <Bot />, {
                          className: "w-5 h-5 text-white",
                        })
                      )}
                    </div>
                    <span className="font-bold text-sm text-slate-700 dark:text-gray-300">
                      {msg.role === "user" ? "You" : AGENTS[msg.agent as keyof typeof AGENTS]?.name || "AI Assistant"}
                    </span>
                  </div>
                  <div className="pl-10 w-full">
                    <p className="text-sm text-slate-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed">
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

          {error && <p className="p-4 text-sm text-red-500 dark:text-red-400">{error}</p>}

          {/* Prompt Input */}
          <div className="p-6 border-t border-white/80 dark:border-gray-700/30">
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSendPrompt()
                  }
                }}
                className="w-full p-4 pr-16 text-sm bg-white/80 dark:bg-gray-800/50 border border-white/80 dark:border-gray-700/40 backdrop-blur-md rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-violet-400 resize-none placeholder:text-slate-400 dark:placeholder:text-gray-500 text-slate-700 dark:text-gray-200 transition-all duration-300"
                placeholder={`Ask ${AGENTS[selectedAgent as keyof typeof AGENTS].name}...`}
                rows={3}
                disabled={isLoading || isApplyingFeedback}
              />
              <button
                onClick={() => handleSendPrompt()}
                disabled={isLoading || isApplyingFeedback || !prompt.trim()}
                className="absolute right-3.5 top-3.5 w-10 h-10 bg-indigo-500 dark:bg-violet-500 text-white rounded-lg hover:bg-indigo-600 dark:hover:bg-violet-600 disabled:bg-slate-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center shadow-lg shadow-indigo-500/40 dark:shadow-violet-500/40 transform active:scale-90"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
