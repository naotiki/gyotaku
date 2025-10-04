#!/usr/bin/env node

import { Command } from 'commander';
import { crawlWebsite } from './crawler';
import * as path from 'path';

const program = new Command();

program
  .name('gyotaku')
  .description('ウェブサイトをクロールしてアーカイブするCLIツール')
  .version('1.0.0');

program
  .argument('<url>', 'クロールするウェブサイトのURL')
  .option('-o, --output <dir>', '出力ディレクトリ', './archive')
  .option('-d, --depth <number>', 'クロールの深さ', '1')
  .option('-w, --wait <ms>', 'リクエスト間の待機時間（ミリ秒）', '1000')
  .action(async (url: string, options) => {
    try {
      const outputDir = path.resolve(options.output);
      const depth = parseInt(options.depth);
      const waitTime = parseInt(options.wait);

      console.log(`クロール開始: ${url}`);
      console.log(`出力先: ${outputDir}`);
      console.log(`深さ: ${depth}`);
      
      await crawlWebsite(url, outputDir, depth, waitTime);
      
      console.log('クロール完了！');
    } catch (error) {
      console.error('エラーが発生しました:', error);
      process.exit(1);
    }
  });

program.parse();
