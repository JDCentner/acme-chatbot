import type {Draft, ModelContext, ModelProvider, RequestDetails} from './contracts.ts';

function latest(context: ModelContext): string { return context.messages.filter(message => message.role === 'user').at(-1)?.content || ''; }
function answer(text: string): Draft { return {text, tools: []}; }
const CONTACT_QUESTION = /(?:first name|last name|email|phone|address|preferred time|reach you)/i;

export class FakeProvider implements ModelProvider {
  readonly mode = 'fake';
  readonly models = {agent: 'fixture', classifier: 'fixture', reviewer: 'fixture', grader: 'fixture'};
  async classify(context: ModelContext): Promise<unknown> {
    const text = latest(context);
    if (/ignore.*instructions|system prompt|reveal.*prompt|bypass|pretend you/i.test(text)) return {decision: 'block', reason: 'Instruction attack fixture.'};
    const related = /acme|community|cost|price|expensive|medicaid|tour|sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|today|monthly|room|living|mom|dad|parent|meal|kosher|sodium|dog|pet|car|dementia|care|brochure|callback|call me|bot|\bai\b|human|job|career|contact|frustrat|confirm|yes|hello|hi\b/i;
    const collecting = CONTACT_QUESTION.test(context.messages.filter(message => message.role === 'assistant').at(-1)?.content || '');
    if (related.test(text) || collecting) return {decision: 'allow', reason: 'Relevant question or request detail fixture.'};
    if (text.length < 8) return {decision: 'clarify', reason: 'Intent is unclear in this fixture.'};
    return {decision: 'block', reason: 'Unrelated request fixture.'};
  }
  async review(_context: ModelContext, draft: string): Promise<unknown> {
    const approved = !/we offer dementia care|kosher meals are available|individual temperature controls are available/i.test(draft);
    return {approved, reasons: ['Fixture check only. This is not a model quality assessment.']};
  }
  async grade(): Promise<unknown> { return {passed: false, reasons: ['Model grading is pending. Fixture mode cannot establish model quality.']}; }

  async draft(context: ModelContext): Promise<Draft> {
    const text = latest(context).toLowerCase();
    const result = context.tools.at(-1);
    if (result && !result.ok) return answer(`I could not save that request. ${JSON.stringify(result.result)} What would you like to change?`);
    if (result?.name === 'confirm_request') return answer('Your local demo request is saved. No staff were contacted and no material was sent.');
    if (result?.name === 'prepare_request') return answer('Please review the details below.');
    if (result?.name === 'check_slots') return this.collect(context);
    if (/medicaid|hud/.test(text)) return answer('The community participates in Medicaid and HUD programs. Eligibility is not confirmed here.');
    if (/kosher|sodium/.test(text)) return answer('Low sugar/salt options are listed. I do not have information about Kosher meals. You can call 850-445-8362 to ask the team.');
    if (/temperature|air conditioning|included|monthly cost/.test(text)) return answer('The monthly cost includes basic cable, WiFi, linen service, three meals, and housekeeping. Rooms have air conditioning. I do not know whether residents can control the temperature.');
    if (/dementia|live together/.test(text)) return answer('Couples can live together. I do not have information about dementia care. Please call 850-445-8362 to discuss your parents’ care needs.');
    if (/dog|pet|retriever/.test(text)) return answer('Small dogs under 25 lbs. and service animals are allowed. I do not have information about exceptions for a larger dog.');
    if (/car/.test(text)) return answer('Residents can bring cars. Resident parking is available.');
    if (/cost|price|how much|expensive/.test(text)) return answer('Independent Living starts at $2,000 a month. Assisted Living starts at $3,000 a month. The entrance fee is $3,500. I do not have prices by room type or size. Would you like a tour?');
    if (/career|job/.test(text)) return answer('For employment information, visit https://www.talkfurther.com/events-demo.');
    if (/bot|\bai\b|human|frustrat/.test(text)) return answer('I am an AI assistant. You can speak with the team at 850-445-8362, or ask me to save a local callback request.');
    return this.collect(context);
  }

  private collect(context: ModelContext): Draft {
    const users = context.messages.filter(message => message.role === 'user').map(message => message.content);
    const transcript = users.join('\n');
    const kind = /brochure|floor plan/i.test(transcript) ? 'brochure' : /callback|call me/i.test(transcript) ? 'callback' : 'tour';
    const availability = [...users].reverse().find(message => /monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|\d{4}-\d{2}-\d{2}/i.test(message));
    const slotResult = [...context.tools].reverse().find(item => item.name === 'check_slots' && item.ok);
    const slotData = slotResult?.result as {slots: string[]} | undefined;
    if (kind === 'tour' && !availability) return answer('What day and time would work for your tour?');
    if (kind === 'tour' && !slotData) return {text: '', tools: [{name: 'check_slots', arguments: {availability}}]};
    if (kind === 'tour' && !slotData?.slots.length) return answer('That time is not available. Tours run Monday to Friday, with starts from 09:00 through 17:00. What other day and time would work?');
    const details = this.contactDetails(context, kind);
    details.slot = kind === 'tour' ? slotData!.slots[0] : null;
    const missing: Array<[keyof RequestDetails, string]> = [
      ['firstName', 'What is your first name?'], ['lastName', 'What is your last name?'],
      ['email', 'What is your email address?'], ['phone', 'What is your phone number?'],
    ];
    if (kind === 'callback') missing.push(['preferredTime', 'What is your preferred time for a callback?']);
    if (kind === 'brochure') missing.push(['address', 'What is your mailing address?']);
    const question = missing.find(([key]) => !details[key]);
    if (question) return answer(question[1]);
    return {text: '', tools: [{name: 'prepare_request', arguments: details}]};
  }

  private contactDetails(context: ModelContext, kind: RequestDetails['kind']): RequestDetails {
    const details: RequestDetails = {kind, firstName: '', lastName: '', email: '', phone: '', slot: null, preferredTime: null, address: null};
    let previous = '';
    for (const message of context.messages) {
      if (message.role === 'assistant') { previous = message.content; continue; }
      const name = message.content.match(/(?:name is|i am|i'm) ([a-z]+)(?: ([a-z]+))?/i);
      if (name) { details.firstName = name[1]; details.lastName = name[2] || ''; }
      if (/first name/i.test(previous) && /^[a-z '-]+$/i.test(message.content) && !message.content.includes('?')) details.firstName = message.content.trim();
      if (/last name/i.test(previous) && /^[a-z '-]+$/i.test(message.content) && !message.content.includes('?')) details.lastName = message.content.trim();
      details.email = message.content.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || details.email;
      details.phone = message.content.match(/\b\d{3}[- ]?\d{3}[- ]?\d{4}\b/)?.[0] || details.phone;
      if (/preferred time/i.test(previous)) details.preferredTime = message.content;
      if (/mailing address/i.test(previous)) details.address = message.content;
    }
    return details;
  }
}
