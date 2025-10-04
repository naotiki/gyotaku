import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';

interface CrawlOptions {
  visited: Set<string>;
  baseUrl: URL;
  outputDir: string;
  currentDepth: number;
  maxDepth: number;
  waitTime: number;
}

/**
 * ウェブサイトをクロールしてアーカイブを作成する
 */
export async function crawlWebsite(
  url: string,
  outputDir: string,
  maxDepth: number = 1,
  waitTime: number = 1000
): Promise<void> {
  const baseUrl = new URL(url);
  const visited = new Set<string>();

  // 出力ディレクトリを作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // メタデータファイルを作成
  const metadata = {
    startUrl: url,
    crawledAt: new Date().toISOString(),
    depth: maxDepth,
  };
  fs.writeFileSync(
    path.join(outputDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  const options: CrawlOptions = {
    visited,
    baseUrl,
    outputDir,
    currentDepth: 0,
    maxDepth,
    waitTime,
  };

  await crawlPage(url, options);
}

/**
 * 1ページをクロールする
 */
async function crawlPage(url: string, options: CrawlOptions): Promise<void> {
  const { visited, baseUrl, outputDir, currentDepth, maxDepth, waitTime } = options;

  // 訪問済みチェック
  if (visited.has(url)) {
    return;
  }

  // 深さチェック
  if (currentDepth > maxDepth) {
    return;
  }

  // 同じドメインかチェック
  try {
    const targetUrl = new URL(url);
    if (targetUrl.hostname !== baseUrl.hostname) {
      return;
    }
  } catch (error) {
    console.error(`無効なURL: ${url}`);
    return;
  }

  visited.add(url);
  console.log(`クロール中: ${url} (深さ: ${currentDepth})`);

  try {
    // ページを取得
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Gyotaku/1.0.0 Web Archiver',
      },
    });

    // HTMLを保存
    const urlObj = new URL(url);
    const filename = sanitizeFilename(urlObj.pathname || 'index') + '.html';
    const filePath = path.join(outputDir, filename);
    
    // ディレクトリを作成
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    fs.writeFileSync(filePath, response.data);

    // リンクを抽出して再帰的にクロール
    if (currentDepth < maxDepth) {
      const $ = cheerio.load(response.data);
      const links: string[] = [];

      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
          try {
            const absoluteUrl = new URL(href, url).href;
            links.push(absoluteUrl);
          } catch (error) {
            // 無効なURLは無視
          }
        }
      });

      // 待機してから次のページへ
      for (const link of links) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        await crawlPage(link, {
          ...options,
          currentDepth: currentDepth + 1,
        });
      }
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`エラー (${url}):`, error.message);
    } else {
      console.error(`エラー (${url}):`, error);
    }
  }
}

/**
 * ファイル名として使用できるように文字列をサニタイズ
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/^\/+|\/+$/g, '') // 先頭と末尾のスラッシュを削除
    .replace(/\//g, '_') // スラッシュをアンダースコアに置換
    .replace(/[^a-zA-Z0-9_.-]/g, '_') // 安全でない文字をアンダースコアに置換
    .replace(/_+/g, '_') // 連続するアンダースコアを1つに
    .slice(0, 200) // 長さを制限
    || 'index'; // 空の場合はindexを使用
}
