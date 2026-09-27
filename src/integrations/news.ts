import { XMLParser } from 'fast-xml-parser';

type NewsItem = {
    title?: string;
    link?: string;
};

export class NewsIntegration {
    private readonly parser = new XMLParser({ processEntities: true });

    async headlines(): Promise<string> {
        const response = await fetch('https://feeds.bbci.co.uk/news/world/rss.xml', {
            headers: { 'User-Agent': 'HawkingWhatsAppBot/1.0' },
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`BBC News returned ${response.status}.`);

        const feed = this.parser.parse(await response.text()) as {
            rss?: { channel?: { item?: NewsItem | NewsItem[] } };
        };
        const items = feed.rss?.channel?.item;
        const headlines = (Array.isArray(items) ? items : items ? [items] : [])
            .filter((item) => item.title && item.link)
            .slice(0, 5);

        if (!headlines.length) throw new Error('BBC News feed had no headlines.');
        return ['BBC World News', ...headlines.map((item, index) => `${index + 1}. ${item.title}\n${item.link}`)].join('\n\n');
    }
}