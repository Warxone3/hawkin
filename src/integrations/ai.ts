type OpenAIResponse = {
    error?: { message?: string };
    output?: Array<{
        content?: Array<{
            text?: string;
            type: string;
        }>;
    }>;
};

export class AIIntegration {
    constructor(
        private readonly apiKey: string,
        private readonly model: string,
    ) {}

    async answer(prompt: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error('AI is not configured. Set OPENAI_API_KEY.');
        }

        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                input: prompt,
                max_output_tokens: 450,
            }),
            signal: AbortSignal.timeout(30_000),
        });
        const result = await response.json() as OpenAIResponse;

        if (!response.ok) {
            throw new Error(result.error?.message || `AI request failed with status ${response.status}.`);
        }

        const answer = result.output
            ?.flatMap((item) => item.content || [])
            .filter((item) => item.type === 'output_text')
            .map((item) => item.text || '')
            .join('\n')
            .trim();

        if (!answer) {
            throw new Error('AI returned an empty response.');
        }

        return answer;
    }
}