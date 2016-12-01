
import { oneLine, stripIndent } from 'common-tags';
import indent from 'indent-string';
import chalk from 'chalk';

export default function createError ({
  kind = '',
  reason = '',
  detailedReason = '',
  solution = ''
}) {
  const err = new Error();
  err.isDawsonError = true;
  err.toFormattedString = function dawsonErrorToString () {
    const errorTitle = chalk.bgRed.bold('Execution Error');
    const kindTitle = chalk.red.bold('Error message:');
    const reasonTitle = chalk.red.bold('Possible cause:');
    const solutionTitle = chalk.green.bold('Possible solution');
    const footer = chalk.gray(oneLine`
      If you believe this is not an expected behaviour or that
      this error message should be improved, open an issue: https://github.com/dawson-org/dawson-cli/issues
    `);

    const msg = stripIndent`
\n
${errorTitle} 

${kindTitle} ${chalk.red.bold(kind)}
${reasonTitle} ${chalk.red(reason)}
${detailedReason}

${solutionTitle}
${solution}

${footer}
    `;
    return indent(msg, 3);
  };
  return err;
}
