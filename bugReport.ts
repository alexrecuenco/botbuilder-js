/* eslint-disable no-console */
import { ActivityTypes, ConversationState, MemoryStorage, TestAdapter } from 'botbuilder';
import { ChoicePrompt, DialogSet, DialogTurnStatus, ListStyle, WaterfallDialog } from 'botbuilder-dialogs';

const STATEMENT = 'Hello, I will ask you a question.';
const QUESTION = 'Do you like me?';
const prompt = new ChoicePrompt('choices', async (p) => {
  if (!p.recognized && p.attemptCount < 2) {
    return false;
  }

  return true;
});
const dialog = new WaterfallDialog('testDialog', [
  async (step) => {
    await step.context.sendActivity(STATEMENT);
    return step.prompt('choices', { prompt: QUESTION, choices: ['Yes', 'Of course'], style: ListStyle.list });
  },
]);

const memory = new MemoryStorage();

const dialogMemory = new ConversationState(memory);

const dialogSet = new DialogSet(dialogMemory.createProperty('dialogs'));

dialogSet.add(prompt);
dialogSet.add(dialog);

const testAdapter = new TestAdapter(async (ctx) => {
  const dc = await dialogSet.createContext(ctx);
  await ctx.sendActivity({ type: ActivityTypes.Typing });
  const result = await dc.continueDialog();
  if (result.status === DialogTurnStatus.empty) {
    await dc.beginDialog('testDialog');
  }
  await dialogMemory.saveChanges(ctx);
});

(async () => {
  await testAdapter.send('hi');
  testAdapter.activeQueue.splice(0, Infinity);
  await testAdapter.send('sorry, what?');
  const texts = testAdapter.activeQueue.map((a) => a.text);
  if (!texts.some((t) => t?.includes(QUESTION))) {
    throw new Error('Question not included in answers');
  }
})()
  .then(() => console.log('Well done'))
  .catch((err) => console.error(err));

// (async () => {
//   await testAdapter
//     .send('hi')
//     .assertReply({ type: ActivityTypes.Typing })
//     .assertReply(STATEMENT)
//     .assertReply((r) => {
//       r.text?.includes(QUESTION);
//     });
//   await testAdapter
//     .send('sorry, what')
//     .assertReply({ type: ActivityTypes.Typing })
//     .assertReply((r) => {
//       r.text?.includes(QUESTION);
//     });
// })()
//   .then(() => console.log('Well done'))
//   .catch((err) => console.error(err));
