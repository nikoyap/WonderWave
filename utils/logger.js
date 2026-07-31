const util = require("util");

class Logger {

    timestamp() {
        return new Date().toISOString();
    }

    format(value) {
        if (value instanceof Error) {
            return value.stack;
        }

        if (typeof value === "object") {
            return util.inspect(value, {
                depth: null,
                colors: true
            });
        }

        return value;
    }

    log(level, ...messages) {
        console.log(
            `[${this.timestamp()}] [${level}]`,
            ...messages.map(message => this.format(message))
        );
    }

    info(...messages) {
        this.log("INFO", ...messages);
    }

    success(...messages) {
        this.log("SUCCESS", ...messages);
    }

    warn(...messages) {
        this.log("WARN", ...messages);
    }

    error(...messages) {
        this.log("ERROR", ...messages);
    }

}

module.exports = new Logger();
