type TriviaResponse = {
    response_code: number;
    results: Array<{
        category: string;
        correct_answer: string;
        incorrect_answers: string[];
        question: string;
    }>;
};

type TriviaRound = {
    answer: string;
    choices: string[];
    answered: boolean;
};

function decode(value: string): string {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
}

function normalize(value: string): string {
    return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export class TriviaIntegration {
    private readonly rounds = new Map<string, TriviaRound>();
    private readonly scores = new Map<string, Map<string, number>>();

    async start(chatId: string): Promise<string> {
        const response = await fetch(
            'https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986',
            { signal: AbortSignal.timeout(15_000) },
        );
        if (!response.ok) throw new Error(`Trivia service returned ${response.status}.`);

        const result = await response.json() as TriviaResponse;
        if (result.response_code !== 0 || !result.results.length) {
            throw new Error('Trivia service did not return a question.');
        }

        const question = result.results[0];
        const answer = decode(question.correct_answer);
        const choices = [answer, ...question.incorrect_answers.map(decode)];
        for (let index = choices.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
        }

        this.rounds.set(chatId, { answer: normalize(answer), choices, answered: false });
        return [
            `Trivia: ${decode(question.category)}`,
            decode(question.question),
            ...choices.map((choice, index) => `${index + 1}. ${choice}`),
            'Reply with !answer <number>. First correct answer gets the point.',
        ].join('\n');
    }

    answer(chatId: string, playerId: string, rawAnswer: string): string {
        const round = this.rounds.get(chatId);
        if (!round) return 'There is no active question. Send !trivia to start one.';
        if (round.answered) return 'That question has already been answered. Send !trivia for another.';

        const choiceNumber = Number(rawAnswer.trim());
        const answer = Number.isInteger(choiceNumber) && choiceNumber >= 1 && choiceNumber <= round.choices.length
            ? round.choices[choiceNumber - 1]
            : rawAnswer;
        if (normalize(answer) !== round.answer) return 'Not quite. Try another answer.';

        round.answered = true;
        const chatScores = this.scores.get(chatId) ?? new Map<string, number>();
        const score = (chatScores.get(playerId) ?? 0) + 1;
        chatScores.set(playerId, score);
        this.scores.set(chatId, chatScores);
        return `Correct! You have ${score} point${score === 1 ? '' : 's'}.`;
    }

    leaderboard(chatId: string): string {
        const scores = [...(this.scores.get(chatId) ?? new Map<string, number>()).entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 5);
        if (!scores.length) return 'No trivia scores yet. Send !trivia to start playing.';
        return ['Trivia leaderboard', ...scores.map(([player, score], index) => `${index + 1}. ${player}: ${score}`)].join('\n');
    }
}