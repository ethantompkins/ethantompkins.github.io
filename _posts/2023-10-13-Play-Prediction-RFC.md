---
layout: post
title: "Forecasting Football Plays with a Random Forest Classifier"
categories: journal
date: 2023-10-13
tags: ['python']
---

# Background Information

Random forests are a method of ensemble learning for classification, regression, and other tasks that involve decision trees during training time. For ensemble learning, several different predictive models are created to solve a particular problem. The several different models are then combined into a single model with the goal of producing a final robust model using the power of many.

Random forests work by generation many decision trees at random. Once a prediction is made, each decision tree is evaluated based on the inputs. The output of each tree gets counted and the modal outcome is selected as the final prediction. Random forests can be used to output classifications and for regression analysis, making them enticing in many scenarios.

Since play calling is so different between programs, we will be using a specific coach and try to predict based on their historical tendencies. Becuase of this, I will be using Dabo Swinney and the Clemson Tigers. 

# Gathering and Cleaning the data

For this we are using numpy, pandas, and the cfbd libraries.

```python
import numpy as np
import pandas as pd
import requests
import cfbd
from cfbd.rest import ApiException
```

Within the CFBD API, play data appears to be the most suitable as it encompasses all essential details regarding the game situation and conveniently categorizes each play type, such as runs, passes, kickoffs, among others. Specifically, I will go from 2015 to present day.

```python
api_instance = cfbd.PlaysApi(cfbd.ApiClient(configuration))
# List to store the lines data for each year
all_plays = []

for year in range(2015, 2023):
  for week in range(1,15):
    try:
    # Play by play data
      api_response = api_instance.get_plays(year=year, week=week, team='Clemson')
      all_plays.extend(api_response)
    except ApiException as e:
      print("Exception when calling PlaysApi->get_plays: %s\n" % e)
```

I will put this all into a dataframe for ease of use: 

```python 
df = pd.DataFrame([
    dict(
        home = l.home,
        away = l.away,
        offense_score = l.offense_score,
        defense_score = l.defense_score,
        period = l.period,
        clock_minutes = l.clock.minutes,
        clock_seconds = l.clock.seconds,
        yards_to_goal = l.yards_to_goal,
        down = l.down,
        distance = l.distance,
        play_type = l.play_type
        )
    for l in all_plays])
```

![All Plays Dataframe](/images/play_prediction_rfc/all_plays_initial.png)

# Cleanup 

We would like to know when Clemson was home while calling plays, so we calculate a column called is_home. Next we want to calculate the total seconds remaining instead of the minutes and seconds remaining, so we will combine them into one seconds_remaining category.

```python
df['is_home'] = np.where(df['home'] == 'Clemson', 1, 0)

df['seconds_remaining'] = (df['clock_minutes'] * 60) + df['clock_seconds']

```

![All Plays Post Cleanup](/images/play_prediction_rfc/after_cleanup.png)

Before constructing our random forest classifier, there's a bit more preparation needed. The 'play_type' field, as it currently stands, is too detailed, outlining both the play's type and outcome (like "Pass Incompletion" or "Rush TD"). We'll refine this to focus solely on the play calls we're interested in: rush, pass, punt, and field goal (FG). I've created a function to categorize plays into these four groups. It's worth noting that some plays, such as kickoffs, timeouts, and penalties, don't fit these categories and will be classified as 'None'. This function should now be run to modify our data frame, adding a new column for the simplified play call classification.

```python
pass_types = ['Pass Reception', 'Pass Interception Return', 'Pass Incompletion', 'Sack', 'Passing Touchdown', 'Interception Return Touchdown']
rush_types = ['Rush', 'Rushing Touchdown']
punt_types = ['Punt', 'Punt Return Touchdown', 'Blocked Punt', 'Blocked Punt Touchdown']
fg_types = ['Field Goal Good', 'Field Goal Missed', 'Blocked Field Goal']

def getPlayCall(x):
    if x in pass_types:
            return 'pass'
    elif x in rush_types:
        return 'rush'
    elif x in punt_types:
        return 'punt'
    elif x in fg_types:
        return 'fg'
    else:
        return None

df['play_call'] = df['play_type'].apply(getPlayCall)
```

What should we do with play types that don't align with our four main play call categories? For the purposes of this project, these plays are irrelevant. Recall that we assigned a 'None' value to these types of plays. Fortunately, Pandas provides a handy function to eliminate rows with missing values. We can even specify which columns to consider when deciding which rows to remove. To clean our data and keep it focused on our study's scope, execute the following code to discard these irrelevant rows.


```python
df.dropna(subset=['play_call'], inplace=True)
```

Let's eliminate any unnecessary columns, specifically those used solely for deriving new columns. To preserve these columns for potential future adjustments, I'll transfer the current data frame into a new variable. This step ensures that we retain access to the original data for any further modifications.

```python
plays = df[['offense_score', 'defense_score', 'period', 'yards_to_goal', 'down', 'distance', 'is_home', 'seconds_remaining', 'play_call']]
```

![Final All Plays Dataframe](/images/play_prediction_rfc/final_all_plays.png)

# Building the Prediction Model

To set up our prediction model, we will import two  modules from the scikit-learn library. The initial module facilitates the division of data into training and validation sets, a process we'll delve into shortly. The second module is pivotal for constructing random forest classifiers, serving as the core of our model-building endeavor.

```python 
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
```

We're now going to organize our data to better suit our model's development. Initially, we'll differentiate between our features (independent variables) and the desired output (dependent variable) of our model. The features will contain various game situation inputs, while the model aims to predict play calls, our dependent variable. Next, we'll divide the data into training and validation subsets. Employing the train_test_split module, previously imported, we'll allocate 20% of our data as the validation set, ensuring we have a robust framework for testing and refining our model.

```python 
# split the data set between our independent variables (i.e. features) and our dependent variable or output
play_calls = plays['play_call']
plays = plays.drop(['play_call'], axis=1)

# split the data into training and validation sets
plays_train, plays_validation, calls_train, calls_validation = train_test_split(plays, play_calls, train_size=0.8, test_size=0.2, random_state=0)
plays_train.head()
```

![Training feature set](/images/play_prediction_rfc/training_feature_set.png)

When training, it is best to have all data in numerical format. While the feature set is, the dependent set of play calls is not. To convert this categorical data into numerical data, we use pd.factorize. 

The factorize method returns two sets, one contained the data as a set of numbers ranging from 0 to 3 and other containing the key mappings telling us which number mapped to which label. We can now build and train the random forest classifier.

Note that we passed in both of our set of features as well as the set of corresponding outputs in numeric format. The validation set of features can be passed through at this point.

```python
# convert the categorical data into numerical data
y, y_keys = pd.factorize(calls_train)
# build the classifier
classifier = RandomForestClassifier(random_state=0, n_estimators=100)
#train the classifier with our test set
classifier.fit(plays_train, y)
# pass validation set of features and see what classifier outputs
classifier.predict(plays_validation)
```

This outputs the raw inputs, so they still need to be converted into labels using the *y_keys* mapping object created earlier. Before doing this, *predict_proba* within the scikit-learn library provides a greater level of granularity by outputting the probabilities within each set of inputs. There are four probabilities for each set of inputs which correspond to our four different output labels (pass/rush/fg/punt).

```python
classifier.predict_proba(plays_validation)[0:10]
```
![predict_proba](/images/play_prediction_rfc/predict_proba.png)

To map our original set of outputs to our category labels, this can be done:

```python
predicted_calls = y_keys[classifier.predict(plays_validation)]
predicted_calls
```

This is not useful until the predicted outputs can be compared to the actual outputs within the validation set. The *crosstab* functionality allows this to be done.

```python
pd.crosstab(calls_validation, predicted_calls, rownames=['Actual Calls'], colnames=['Predicted Calls'])
```

![Crosstab Chart](/images/play_prediction_rfc/crosstab_image.png)

In the validation set, each row corresponds to the actual type of play calls, while the columns display the predictions made by the classifier. The classifier is quite effective in forecasting when Dabo opts for punts and field goals. It also shows reasonable accuracy in predicting running plays, though its performance in predicting passing plays is less accurate. This indicates that there's still potential for enhancing the model's precision.

# Improving the Model

Using the *feature_importances_* property from the classifier, the importance of each feature when forming predictions can be viewed.

```python 
list(zip(plays_train, classifier.feature_importances_))
```

![Feature Importance](/images/play_prediction_rfc/feature_importance.png)

The model is prioritizing factors like the seconds remaining in the quarter, the current down, and the distance to the goal line. However, it seems to be minimally utilizing the home/away indicator, which might just be contributing confusion. So, let's remove that column and observe the impact. Additionally, considering the model's limited use of the period field, this could be integrated into the seconds remaining, similar to our earlier adjustment with the minutes. This could streamline the data further for potentially better model performance.

```python
# incorporate period into seconds_remaining
plays['margin'] = plays['offense_score'] - plays['defense_score']
# drop is_home and period columns
plays = plays.drop(columns=['offense_score', 'defense_score'])
```

Play calling likely depends more on a team's lead or deficit than on the absolute scores. Because of this, *offense_score* and *defense_score* could be combined. Merging these into a single score margin field could provide a more relevant measure for the analysis. 

```python
plays_train, plays_validation, calls_train, calls_validation = train_test_split(plays, play_calls, train_size=0.8, test_size=0.2, random_state=0)
y, y_keys = pd.factorize(calls_train)

classifier = RandomForestClassifier(n_estimators=100, random_state=0)
classifier.fit(plays_train, y)

predicted_calls = y_keys[classifier.predict(plays_validation)]

pd.crosstab(calls_validation, predicted_calls, rownames=['Actual Calls'], colnames=['Predicted Calls'])
```

![Predicted Calls Chart](/images/play_prediction_rfc/predicted_calls_new.png)

The model now shows enhanced accuracy in predicting passing plays. Predictions for rushing plays have remained largely consistent with the previous version of the model. There is very high accuracy in predicting punt calls and are nearing perfection with field goal predictions.

While there are additional improvements that could be made, the next step is to apply the model to real-time scenarios. A function can be written to process inputs such as the yard line, down, distance, time left, and score difference, enabling the model to evaluate situations as they occur in live games.

```python
def predict_call(yards, down, distance, seconds, margin):
    test_plays = pd.DataFrame({'yards_to_goal': [yards], 'down': [down], 'distance': [distance], 'seconds_remaining': [seconds], 'margin': [margin]})
    return y_keys[classifier.predict(test_plays)][0]
```

For example, the ball is on the 50 yard line. It's forth and 1 with 2 minutes left, and Clemson is down by 5 points.

```python
call = predict_call(50, 4, 1, 120, -5)
call
```
```python
rush
```

The model predicts Clemson will call a run play. Now imagine the exact same scenario but Clemson is up by 9.

```python
call = predict_call(50, 4, 1, 120, 9)
call
```
```python
punt
```

Now the model predicts a punt. In these two situations the outputs seem reasonable. 

# Next Steps for Improvements

Looking at our results, some changes can be made to improve our results. The sample size of 8 years may be too much. In this time span, the play calling can evolve with the game or depending on the staff changes made within the specific program. Training on 1 or 2 seasons may produce more quality predictons. 

Additional changes that can be made: 
 1. Isolating the data by offensive coordinator instead of by head coach.
 2. Look at the list of available data points and determine if adding or modifying them can yield a more accurate model.
 3. Examine the list of probabilities for each outcome and see why these numbers are being returned.





