import { describe, expect, it } from 'vitest';
import { CommandBus } from './CommandBus';

describe('CommandBus metadata', () => {
	it('assigns stable i18n keys from command ids', () => {
		const bus = new CommandBus();
		bus.register({
			id: 'test.say-hello',
			label: 'Say Hello',
			description: 'Greets the user',
			group: 'Test',
			run: () => undefined
		});

		const command = bus.get('test.say-hello');
		expect(command?.labelKey).toBe('commands.test.say-hello.label');
		expect(command?.descriptionKey).toBe('commands.test.say-hello.description');
		expect(command?.groupKey).toBe('commands.test.say-hello.group');
	});
});

	describe('undo and redo history', () => {
		it('restores and reapplies a reversible operation', async () => {
			const bus = new CommandBus();
			let value = 0;
			bus.register({
				id: 'test.increment',
				label: 'Increment',
				run: () => {
					value = 1;
					return {
						undo: {
							label: 'Increment',
							run: () => { value = 0; },
							redo: () => { value = 1; }
						}
					};
				}
			});
			await bus.dispatch('test.increment');
			expect(value).toBe(1);
			await bus.undo();
			expect(value).toBe(0);
			await bus.redo();
			expect(value).toBe(1);
		});
	});
