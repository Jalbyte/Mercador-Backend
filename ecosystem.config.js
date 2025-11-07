module.exports = {
  apps: [{
    name: 'mercador-backend',
    script: 'npm',
    args: 'start',
    cwd: '/home/ec2-user/mercador',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3010
    },
    // Los logs se guardarán en /home/ec2-user/.pm2/logs/
    error_file: '/home/ec2-user/mercador/logs/error.log',
    out_file: '/home/ec2-user/mercador/logs/output.log',
    log_file: '/home/ec2-user/mercador/logs/combined.log',
    time: true
  }]
}