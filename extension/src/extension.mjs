import * as vscode from 'vscode';
import { extendMarkdownIt } from './markdown.mjs';

export function activate(context) {
  const enabled = () => vscode.workspace.getConfiguration('markdownMathPreview').get('enabled', false);
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownMathPreview.open', async () => {
      if (!enabled()) {
        await vscode.workspace.getConfiguration('markdownMathPreview').update('enabled', true, vscode.ConfigurationTarget.Workspace);
      }
      return vscode.commands.executeCommand('markdown.showPreviewToSide');
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('markdownMathPreview.enabled')) vscode.commands.executeCommand('markdown.api.reloadPlugins');
    })
  );
  return { extendMarkdownIt: md => enabled() ? extendMarkdownIt(md) : md };
}
