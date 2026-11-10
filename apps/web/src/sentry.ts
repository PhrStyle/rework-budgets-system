// Só o que a tela usa do SDK, em importações nomeadas: o empacotador leva apenas isso para o pedaço
// carregado sob demanda (importar o pacote inteiro levaria gravação de sessão, feedback etc.).
export { captureException, init, setUser, withScope } from '@sentry/browser';
