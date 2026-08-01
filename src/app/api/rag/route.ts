import { NextRequest, NextResponse } from 'next/server';
import { indexDocument, searchKnowledge, listDocuments, deleteDocument } from '@/lib/rag';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, content, source, query, apiKey, baseURL, topK } = body;

    if (!apiKey || !baseURL) {
      return NextResponse.json({ error: '请提供 API Key 和 Base URL' }, { status: 400 });
    }

    switch (action) {
      case 'index': {
        if (!content || !source) {
          return NextResponse.json({ error: '缺少 content 或 source' }, { status: 400 });
        }
        console.log(`[RAG API] 索引文档: ${source}, baseURL: ${baseURL}, key: ${apiKey.substring(0, 8)}...`);
        const result = await indexDocument(content, source, apiKey, baseURL);
        return NextResponse.json({ success: true, ...result });
      }

      case 'search': {
        if (!query) {
          return NextResponse.json({ error: '缺少 query' }, { status: 400 });
        }
        const results = await searchKnowledge(query, apiKey, baseURL, topK || 3);
        return NextResponse.json({ success: true, results });
      }

      case 'list': {
        const docs = await listDocuments();
        return NextResponse.json({ success: true, documents: docs });
      }

      case 'delete': {
        if (!source) {
          return NextResponse.json({ error: '缺少 source' }, { status: 400 });
        }
        const deleted = await deleteDocument(source);
        return NextResponse.json({ success: true, deleted });
      }

      default:
        return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 },
    );
  }
}
