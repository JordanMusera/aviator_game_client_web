module.exports = {
  apps: [{
    name: 'aviator-game-client',
    script: 'serve',
    args: ['-s', 'build', '-l', '8086'],
    cwd: '/root/aviator_game_client_web',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
