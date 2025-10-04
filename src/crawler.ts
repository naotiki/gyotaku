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
  downloadedResources: Set<string>;
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
  const downloadedResources = new Set<string>();

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
    downloadedResources,
  };

  await crawlPage(url, options);
}

/**
 * 1ページをクロールする
 */
async function crawlPage(url: string, options: CrawlOptions): Promise<void> {
  const { visited, baseUrl, outputDir, currentDepth, maxDepth, waitTime, downloadedResources } = options;

  // 訪問済みチェック
  if (visited.has(url)) {
    return;
  }

  // 深さチェック
  if (currentDepth > maxDepth) {
    return;
  }

  // 同じドメインかチェック（HTMLページのみ。リソースは別）
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
      responseType: 'text',
    });

    // URLに基づいてディレクトリ構造を作成
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;
    
    // パスからファイル名を取得（パスが/で終わる場合はindex.htmlとする）
    let filename = 'index.html';
    let dirPath = urlPath;
    
    if (urlPath && !urlPath.endsWith('/')) {
      const lastSlashIndex = urlPath.lastIndexOf('/');
      if (lastSlashIndex >= 0) {
        dirPath = urlPath.substring(0, lastSlashIndex);
        filename = urlPath.substring(lastSlashIndex + 1);
        // 拡張子がない場合は.htmlを追加
        if (!filename.includes('.')) {
          filename += '.html';
        }
      }
    }

    // ホスト名とパスを組み合わせてディレクトリを作成
    const hostDir = path.join(outputDir, urlObj.hostname);
    const fullDir = path.join(hostDir, dirPath);
    
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }

    const filePath = path.join(fullDir, filename);

    // HTMLを解析してリソースをダウンロード
    const $ = cheerio.load(response.data);

    // すべてのリソースをダウンロード
    await downloadResources($, url, outputDir, downloadedResources, waitTime);

    // HTMLを保存（リソース参照を書き換え済み）
    fs.writeFileSync(filePath, $.html());
    console.log(`保存完了: ${filePath}`);

    // リンクを抽出して再帰的にクロール
    if (currentDepth < maxDepth) {
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
 * HTMLからすべてのリソースをダウンロードして参照を書き換える
 */
async function downloadResources(
  $: ReturnType<typeof cheerio.load>,
  pageUrl: string,
  outputDir: string,
  downloadedResources: Set<string>,
  waitTime: number
): Promise<void> {
  const resources: Array<{ url: string; selector: string; attr: string }> = [];

  // 画像
  $('img[src]').each((_, element) => {
    const src = $(element).attr('src');
    if (src) {
      resources.push({ url: src, selector: 'img', attr: 'src' });
    }
  });

  // CSS
  $('link[rel="stylesheet"][href]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      resources.push({ url: href, selector: 'link[rel="stylesheet"]', attr: 'href' });
    }
  });

  // JavaScript
  $('script[src]').each((_, element) => {
    const src = $(element).attr('src');
    if (src) {
      resources.push({ url: src, selector: 'script', attr: 'src' });
    }
  });

  // その他のリソース（favicon, fonts, etc.）
  $('link[href]').each((_, element) => {
    const rel = $(element).attr('rel');
    const href = $(element).attr('href');
    if (href && rel !== 'stylesheet') {
      resources.push({ url: href, selector: 'link', attr: 'href' });
    }
  });

  // 各リソースをダウンロード
  for (const resource of resources) {
    try {
      const absoluteUrl = new URL(resource.url, pageUrl).href;
      
      // すでにダウンロード済みかチェック
      if (downloadedResources.has(absoluteUrl)) {
        continue;
      }

      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      const localPath = await downloadResource(absoluteUrl, outputDir);
      if (localPath) {
        downloadedResources.add(absoluteUrl);
        
        // HTMLの参照を書き換え
        const relativePathFromRoot = path.relative(outputDir, localPath);
        $(`${resource.selector}[${resource.attr}="${resource.url}"]`).attr(resource.attr, '/' + relativePathFromRoot.replace(/\\/g, '/'));
        
        console.log(`リソース保存: ${absoluteUrl} -> ${localPath}`);
      }
    } catch (error) {
      console.error(`リソースダウンロードエラー (${resource.url}):`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * リソースをダウンロードして保存
 */
async function downloadResource(url: string, outputDir: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Gyotaku/1.0.0 Web Archiver',
      },
      responseType: 'arraybuffer',
    });

    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;
    
    // ホスト名とパスを組み合わせてディレクトリを作成
    const hostDir = path.join(outputDir, urlObj.hostname);
    
    // パスからディレクトリとファイル名を分離
    let filename = 'index';
    let dirPath = urlPath;
    
    if (urlPath && urlPath !== '/') {
      const lastSlashIndex = urlPath.lastIndexOf('/');
      if (lastSlashIndex >= 0) {
        dirPath = urlPath.substring(0, lastSlashIndex);
        const filenameFromPath = urlPath.substring(lastSlashIndex + 1);
        if (filenameFromPath) {
          filename = filenameFromPath;
        }
      }
    }

    const fullDir = path.join(hostDir, dirPath);
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }

    const filePath = path.join(fullDir, filename);
    fs.writeFileSync(filePath, response.data);
    
    return filePath;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`リソースダウンロード失敗 (${url}):`, error.message);
    }
    return null;
  }
}

