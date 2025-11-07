module.exports = {
  apps: [{
    name: 'mercador-backend',
    script: 'dist/index.js',
    cwd: '/home/ec2-user/mercador',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    dotenv: './.env',
    error_file: '/home/ec2-user/mercador/logs/error.log',
    out_file: '/home/ec2-user/mercador/logs/output.log',
    log_file: '/home/ec2-user/mercador/logs/combined.log',
    time: true
  }]
}