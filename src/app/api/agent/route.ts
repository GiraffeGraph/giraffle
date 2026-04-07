import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { prompt, context } = await req.json();

    const systemPrompt = `Sen, GiraffeGraph isimli gelişmiş bir bağlantısal not alma aracı içindeki "Inline AI Asistan"ısın. 
Görevlerin şunlar olabilir: Geliştirmek, özetlemek, düzeltmek veya yeni fikirler/bağlantılar eklemek.
Sana kullanıcının aktif olarak üzerinde çalıştığı sayfanın/notun içeriği bağlam (context) olarak iletildi.

🚨 ÖNEMLİ KURALLAR:
1. Sadece istenilen işlemi (yazı düzenleme, yeni satırlar yazma vb.) doğrudan üret. 
2. Asla "Harika, işte yazdım:", "Buyurun efendim:" gibi konuşma kalıplarına girme. 
3. Çıktın, direkt olarak kullanıcının Markdown/Tiptap dokümanına bir blok olarak eklenecek, sadece yerleştirilecek saf (raw) içeriği dön.

İşte sayfanın güncel bağlamı:
------------------------------------------
${context}
------------------------------------------`;

    const result = streamText({
      // We are specifying gpt-4o-mini globally for these fast inline tasks for optimal DX (low latency)
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      prompt: prompt,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("AI Stream Error:", error);
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response("Bilinmeyen bir hata oluştu.", { status: 500 });
  }
}
