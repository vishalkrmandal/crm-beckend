// backend/services/cronJobService.js
const cron = require('node-cron');
const CommissionService = require('./commissionService');

class CronJobService {

    // Auto sync trades every hour
    startAutoSync() {
        // Run every hour at minute 0
        cron.schedule('0 * * * *', async () => {
            try {
                console.log('Starting automated trade sync...');

                // Get current time and 1 hour ago
                const endTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
                const startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

                const result = await CommissionService.syncAndProcessTrades(startTime, endTime);

                console.log('Automated trade sync completed:', result);
            } catch (error) {
                console.error('Error in automated trade sync:', error);
            }
        });

        console.log('Auto sync cron job started - runs every hour');
    }

    // Daily sync for the past 24 hours (as backup)
    startDailySync() {
        // Run every day at 2:00 AM
        cron.schedule('0 2 * * *', async () => {
            try {
                console.log('Starting daily trade sync...');

                // Get last 24 hours
                const endTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
                const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

                const result = await CommissionService.syncAndProcessTrades(startTime, endTime);

                console.log('Daily trade sync completed:', result);
            } catch (error) {
                console.error('Error in daily trade sync:', error);
            }
        });

        console.log('Daily sync cron job started - runs every day at 2:00 AM');
    }

    // Manual sync for specific time range
    async manualSync(startTime, endTime) {
        try {
            console.log(`Manual sync initiated from ${startTime} to ${endTime}`);

            const result = await CommissionService.syncAndProcessTrades(startTime, endTime);

            console.log('Manual sync completed:', result);
            return result;
        } catch (error) {
            console.error('Error in manual sync:', error);
            throw error;
        }
    }

    // Initialize all cron jobs
    initializeCronJobs() {
        this.startAutoSync();
        this.startDailySync();
        console.log('All cron jobs initialized');
    }
}

module.exports = new CronJobService();