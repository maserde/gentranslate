export class Logger {
	public readonly BASE_TEMPLATE_LOG = '[%s] %s: %s'

	public log(
		level: 'INFO' | 'ERROR' | 'DEBUG' | 'WARN',
		message: string,
		...args: any[]
	): void {
		console.log(
			this.BASE_TEMPLATE_LOG,
			new Date().toISOString(),
			level,
			message,
			...args
		)
	}
}
