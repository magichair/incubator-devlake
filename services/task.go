package services

import (
	"encoding/json"
	"strings"

	"github.com/merico-dev/lake/config"
	"github.com/merico-dev/lake/errors"
	"github.com/merico-dev/lake/logger"
	"github.com/merico-dev/lake/models"
	"github.com/merico-dev/lake/plugins"
)

const (
	TASK_CREATED   = "TASK_CREATED"
	TASK_COMPLETED = "TASK_COMPLETED"
	TASK_FAILED    = "TASK_FAILED"
)

// FIXME: don't use notification service here
// move it to controller
var notificationService *NotificationService

type NewTask struct {
	// Plugin name
	Plugin string `json:"plugin" binding:"required"`
	// Options for the plugin task to be triggered
	Options map[string]interface{} `json:"options" binding:"required"`
}

func init() {
	var notificationEndpoint = config.V.GetString("NOTIFICATION_ENDPOINT")
	var notificationSecret = config.V.GetString("NOTIFICATION_SECRET")
	if strings.TrimSpace(notificationEndpoint) != "" {
		notificationService = NewNotificationService(notificationEndpoint, notificationSecret)
	}
	// FIXME: don't cancel tasks here
	models.Db.Model(&models.Task{}).Where("status != ?", TASK_COMPLETED).Update("status", TASK_FAILED)
}

func CreateTaskInDB(data NewTask) (*models.Task, error) {
	logger.Info("JON >>> createing task in db", 999)
	b, err := json.Marshal(data.Options)
	if err != nil {
		return nil, err
	}
	task := models.Task{
		Plugin:  data.Plugin,
		Options: b,
		Status:  TASK_CREATED,
		Message: "",
	}
	err = models.Db.Save(&task).Error
	if err != nil {
		logger.Error("Database error", err)
		return nil, errors.InternalError
	}
	return &task, nil
}

func RunTask(task models.Task, data NewTask, taskComplete chan bool) (models.Task, error) {
	// trigger plugins
	data.Options["ID"] = task.ID
	go func() {
		logger.Info("run task ", task)
		progress := make(chan float32)
		go func() {
			err := plugins.RunPlugin(task.Plugin, data.Options, progress)
			if err != nil {
				logger.Error("Task error", err)
				task.Status = TASK_FAILED
				task.Message = err.Error()
			}
			err = models.Db.Save(&task).Error
			if err != nil {
				logger.Error("Database error", err)
			}
		}()

		for p := range progress {
			task.Progress = p
			models.Db.Save(&task)
			logger.Info("running plugin progress", task)
		}
		task.Status = TASK_COMPLETED
		err := models.Db.Save(&task).Error
		if err != nil {
			logger.Error("Database error", err)
		}
		// TODO: send notification
		if notificationService != nil {
			err = notificationService.TaskSuccess(TaskSuccessNotification{
				TaskID:     task.ID,
				PluginName: task.Plugin,
				CreatedAt:  task.CreatedAt,
				UpdatedAt:  task.UpdatedAt,
			})
			if err != nil {
				logger.Error("Failed to send notification", err)
			}
		}
		taskComplete <- true
	}()
	return task, nil
}

func GetTasks(status string) ([]models.Task, error) {
	db := models.Db
	if status != "" {
		db = db.Where("status = ?", status)
	}
	tasks := make([]models.Task, 0)
	err := db.Find(&tasks).Error
	if err != nil {
		return nil, err
	}
	return tasks, nil
}

func CreateTasksInDBFromJSON(data [][]NewTask) [][]models.Task {
	// create all the tasks in the db without running the tasks
	var tasks [][]models.Task

	// DELETE COMMENTS
	// for i := 0; i < len(data); i++ {
	// 	logger.Info("JON >>> 1", 1)
	// 	logger.Info("JON >>> len(data)", len(data))
	// 	for j := 0; j < len(data[i]); j++ {
	// 		logger.Info("JON >>> 2", 2)
	// 		logger.Info("JON >>> len(data[i])", len(data[i]))
	// 		task, _ := CreateTaskInDB(data[i][j])
	// 		tasks = append(tasks[i], *task)
	// 	}
	// }

	for i := 0; i < len(data); i++ {
		var tasksToAppend []models.Task
		for j := 0; j < len(data[i]); j++ {
			task, _ := CreateTaskInDB(data[i][j])
			tasksToAppend = append(tasksToAppend, *task)
		}
		tasks = append(tasks, tasksToAppend)
	}

	return tasks
}

func RunAllTasks(data [][]NewTask, tasks [][]models.Task) (err error) {
	// This double for loop executes each set of tasks sequentially while
	// executing the set of tasks concurrently.
	// for _, array := range data {
	for i := 0; i < len(data); i++ {

		taskComplete := make(chan bool)
		count := 0
		// for _, taskFromRequest := range array {
		for j := 0; j < len(data[i]); j++ {
			_, err := RunTask(tasks[i][j], data[i][j], taskComplete)
			if err != nil {
				return err
			}
		}
		for range taskComplete {
			count++
			if count == len(data[i]) {
				close(taskComplete)
			}
		}
	}
	return nil
}
